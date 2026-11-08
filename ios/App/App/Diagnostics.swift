import Foundation
import UIKit
import Network
import MetricKit
import Capacitor

/// Device checks for remote diagnostics (Settings > Diagnostics in the app).
///
/// Runs natively so it works when iOS wakes the app in the background for a
/// silent push, where the web view can't be relied on. The same collector
/// backs the in-app Diagnostics screen through `DiagnosticsPlugin`.
///
/// It only ever reports on this phone's own state: iOS gives no app access to
/// other apps, system logs or battery health, and none is attempted.
enum Diagnostics {
    static let consentKey = "dh.diag.consent"
    private static let bootsKey = "dh.diag.boots"
    private static let lastReportKey = "dh.diag.lastReport"

    static var consent: Bool {
        get { UserDefaults.standard.bool(forKey: consentKey) }
        set { UserDefaults.standard.set(newValue, forKey: consentKey) }
    }

    /// Only ever upload to our own API, whatever a push says.
    static func isTrustedUploadURL(_ s: String) -> Bool {
        guard let url = URL(string: s), url.scheme == "https" else { return false }
        return url.host == "staff.dhwebsiteservices.co.uk"
    }

    static func collect(trigger: String, completion: @escaping ([String: Any]) -> Void) {
        let started = Date()
        var report: [String: Any] = [
            "version": 1,
            "trigger": trigger,
            "ranAt": iso(started),
            "appState": appStateName(),
        ]
        report["device"] = deviceInfo()
        report["battery"] = batteryInfo()
        report["thermal"] = thermalName(ProcessInfo.processInfo.thermalState)
        report["storage"] = storageInfo()
        report["memory"] = memoryInfo()
        report["restarts"] = restartInfo()
        report["stability"] = MetricsSink.shared.summary()

        let group = DispatchGroup()
        var network: [String: Any] = [:]
        var services: [[String: Any]] = []
        var speed: [String: Any] = [:]

        group.enter()
        networkPath { path in network = path; group.leave() }

        group.enter()
        checkServices { results in services = results; group.leave() }

        group.enter()
        downloadSpeed { result in speed = result; group.leave() }

        group.notify(queue: .main) {
            network["speed"] = speed
            report["network"] = network
            report["services"] = services
            report["durationMs"] = Int(Date().timeIntervalSince(started) * 1000)
            report["issues"] = issues(report)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastReportKey)
            completion(report)
        }
    }

    // MARK: - Upload (background runs)

    static func upload(report: [String: Any], id: String, key: String, to api: String, completion: @escaping (Bool) -> Void) {
        guard isTrustedUploadURL(api), let url = URL(string: api),
              let body = try? JSONSerialization.data(withJSONObject: ["id": id, "key": key, "report": report]) else {
            completion(false); return
        }
        var req = URLRequest(url: url, timeoutInterval: 12)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = body
        URLSession.shared.dataTask(with: req) { _, response, error in
            let ok = error == nil && ((response as? HTTPURLResponse)?.statusCode ?? 0) == 200
            completion(ok)
        }.resume()
    }

    // MARK: - Checks

    private static func deviceInfo() -> [String: Any] {
        var sys = utsname()
        uname(&sys)
        let model = withUnsafePointer(to: &sys.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        let info = Bundle.main.infoDictionary ?? [:]
        return [
            "model": model,
            "name": UIDevice.current.name,
            "system": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
            "appVersion": "\(info["CFBundleShortVersionString"] ?? "?") (\(info["CFBundleVersion"] ?? "?"))",
            "locale": Locale.current.identifier,
            "timeZone": TimeZone.current.identifier,
            "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
        ]
    }

    private static func batteryInfo() -> [String: Any] {
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel
        let state: String
        switch device.batteryState {
        case .charging: state = "charging"
        case .full: state = "full"
        case .unplugged: state = "unplugged"
        default: state = "unknown"
        }
        return [
            "level": level < 0 ? NSNull() : Int((level * 100).rounded()),
            "state": state,
            "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
        ]
    }

    private static func storageInfo() -> [String: Any] {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey])
        let free = Double(values?.volumeAvailableCapacityForImportantUsage ?? 0)
        let total = Double(values?.volumeTotalCapacity ?? 0)
        return [
            "freeGB": round1(free / 1_000_000_000),
            "totalGB": round1(total / 1_000_000_000),
            "freePercent": total > 0 ? Int((free / total * 100).rounded()) : NSNull(),
        ]
    }

    private static func memoryInfo() -> [String: Any] {
        let physical = Double(ProcessInfo.processInfo.physicalMemory)
        let available = Double(os_proc_available_memory())
        return [
            "physicalGB": round1(physical / 1_073_741_824),
            "appHeadroomMB": Int(available / 1_048_576),
        ]
    }

    /// iOS doesn't say why a phone restarted, but the boot time changes every
    /// time it does. Each run records the boot time; the history shows how
    /// often it has restarted between checks (crash, update or someone turning
    /// it off and on).
    private static func restartInfo() -> [String: Any] {
        var tv = timeval()
        var size = MemoryLayout<timeval>.stride
        var mib: [Int32] = [CTL_KERN, KERN_BOOTTIME]
        let bootTime: Double
        if sysctl(&mib, 2, &tv, &size, nil, 0) == 0 {
            bootTime = Double(tv.tv_sec)
        } else {
            bootTime = Date().timeIntervalSince1970 - ProcessInfo.processInfo.systemUptime
        }

        var boots = (UserDefaults.standard.array(forKey: bootsKey) as? [Double]) ?? []
        if boots.last.map({ abs($0 - bootTime) > 120 }) ?? true { boots.append(bootTime) }
        boots = Array(boots.suffix(30))
        UserDefaults.standard.set(boots, forKey: bootsKey)

        let now = Date().timeIntervalSince1970
        let lastReport = UserDefaults.standard.double(forKey: lastReportKey)
        let weekAgo = now - 7 * 86_400
        return [
            "lastBoot": iso(Date(timeIntervalSince1970: bootTime)),
            "uptimeHours": round1((now - bootTime) / 3600),
            "seenLast7Days": boots.filter { $0 >= weekAgo }.count,
            "sinceLastReport": lastReport > 0 ? boots.filter { $0 > lastReport }.count : NSNull(),
            "recent": boots.suffix(8).reversed().map { iso(Date(timeIntervalSince1970: $0)) },
        ]
    }

    private static func networkPath(completion: @escaping ([String: Any]) -> Void) {
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "dh.diag.path")
        var done = false
        let finish: ([String: Any]) -> Void = { result in
            queue.async {
                if done { return }
                done = true
                monitor.cancel()
                completion(result)
            }
        }
        monitor.pathUpdateHandler = { path in
            var type = "none"
            if path.usesInterfaceType(.wifi) { type = "wifi" }
            else if path.usesInterfaceType(.cellular) { type = "cellular" }
            else if path.usesInterfaceType(.wiredEthernet) { type = "wired" }
            else if path.status == .satisfied { type = "other" }
            finish([
                "online": path.status == .satisfied,
                "type": type,
                "expensive": path.isExpensive,
                "constrained": path.isConstrained,
            ])
        }
        monitor.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 2) { finish(["online": false, "type": "unknown"]) }
    }

    private static let serviceChecks: [(String, String)] = [
        ("Staff portal", "https://staff.dhwebsiteservices.co.uk/"),
        ("DH website", "https://www.dhwebsiteservices.co.uk/"),
        ("Bill Pal", "https://billpal-api.aged-silence-66a7.workers.dev/health"),
        ("Case Files", "https://casefiles-api.aged-silence-66a7.workers.dev/health"),
        ("Apple", "https://www.apple.com/library/test/success.html"),
    ]

    private static func checkServices(completion: @escaping ([[String: Any]]) -> Void) {
        let group = DispatchGroup()
        var results = [[String: Any]](repeating: [:], count: serviceChecks.count)
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 6
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let session = URLSession(configuration: config)
        for (i, (name, address)) in serviceChecks.enumerated() {
            guard let url = URL(string: address) else { continue }
            group.enter()
            let start = Date()
            session.dataTask(with: url) { _, response, error in
                let ms = Int(Date().timeIntervalSince(start) * 1000)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                results[i] = ["name": name, "ok": error == nil && (200..<400).contains(status), "status": status, "ms": ms, "error": error?.localizedDescription ?? NSNull()]
                group.leave()
            }.resume()
        }
        group.notify(queue: .main) { session.finishTasksAndInvalidate(); completion(results) }
    }

    /// A 2 MB download from Cloudflare's public speed endpoint.
    private static func downloadSpeed(completion: @escaping ([String: Any]) -> Void) {
        guard let url = URL(string: "https://speed.cloudflare.com/__down?bytes=2000000") else { completion([:]); return }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        let session = URLSession(configuration: config)
        let start = Date()
        session.dataTask(with: url) { data, _, error in
            let secs = Date().timeIntervalSince(start)
            if let data = data, error == nil, secs > 0 {
                completion(["downMbps": round1(Double(data.count) * 8 / secs / 1_000_000), "bytes": data.count, "seconds": round1(secs)])
            } else {
                completion(["downMbps": NSNull(), "error": error?.localizedDescription ?? "No data"])
            }
            session.finishTasksAndInvalidate()
        }.resume()
    }

    // MARK: - Findings in plain English

    private static func issues(_ r: [String: Any]) -> [String] {
        var out: [String] = []
        if let s = r["storage"] as? [String: Any], let free = s["freeGB"] as? Double, free < 5 {
            out.append(free < 2 ? "Storage almost full (\(free) GB free) — likely cause of crashes and freezes" : "Storage getting low (\(free) GB free)")
        }
        if let b = r["battery"] as? [String: Any] {
            if let level = b["level"] as? Int, level < 15, (b["state"] as? String) == "unplugged" { out.append("Battery at \(level)%") }
            if (b["lowPowerMode"] as? Bool) == true { out.append("Low Power Mode is on (slows the phone and delays notifications)") }
        }
        if let t = r["thermal"] as? String, t == "serious" || t == "critical" { out.append("Phone is running hot (\(t))") }
        if let re = r["restarts"] as? [String: Any], let n = re["seenLast7Days"] as? Int, n >= 2 { out.append("Restarted \(n) times in the last 7 days") }
        if let n = r["network"] as? [String: Any] {
            if (n["online"] as? Bool) == false { out.append("No internet connection") }
            if let sp = n["speed"] as? [String: Any], let mbps = sp["downMbps"] as? Double, mbps < 5 { out.append("Slow connection (\(mbps) Mbps)") }
        }
        if let svc = r["services"] as? [[String: Any]] {
            for s in svc where (s["ok"] as? Bool) == false { out.append("Couldn't reach \(s["name"] ?? "a service")") }
            for s in svc where (s["ok"] as? Bool) == true && ((s["ms"] as? Int) ?? 0) > 1500 { out.append("\(s["name"] ?? "A service") is slow to respond (\(s["ms"] ?? 0) ms)") }
        }
        if let st = r["stability"] as? [String: Any] {
            if let c = st["appCrashes7d"] as? Int, c > 0 { out.append("This app crashed \(c) time\(c == 1 ? "" : "s") in the last 7 days") }
            if let h = st["appHangs7d"] as? Int, h > 0 { out.append("This app froze \(h) time\(h == 1 ? "" : "s") in the last 7 days") }
        }
        return out
    }

    // MARK: - Helpers

    private static func thermalName(_ s: ProcessInfo.ThermalState) -> String {
        switch s {
        case .nominal: return "normal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    private static func appStateName() -> String {
        switch UIApplication.shared.applicationState {
        case .active: return "foreground"
        case .background: return "background"
        default: return "inactive"
        }
    }

    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        return f.string(from: d)
    }

    private static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
}

/// Collects Apple's daily crash and hang reports for this app (MetricKit).
final class MetricsSink: NSObject, MXMetricManagerSubscriber {
    static let shared = MetricsSink()
    private let key = "dh.diag.metrics"

    func start() { MXMetricManager.shared.add(self) }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        var entries = stored()
        for p in payloads {
            entries.append([
                "at": p.timeStampEnd.timeIntervalSince1970,
                "crashes": p.crashDiagnostics?.count ?? 0,
                "hangs": p.hangDiagnostics?.count ?? 0,
                "cpu": p.cpuExceptionDiagnostics?.count ?? 0,
                "disk": p.diskWriteExceptionDiagnostics?.count ?? 0,
            ])
        }
        save(entries)
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        var entries = stored()
        for p in payloads {
            guard let exits = p.applicationExitMetrics else { continue }
            let fg = exits.foregroundExitData, bg = exits.backgroundExitData
            entries.append([
                "at": p.timeStampEnd.timeIntervalSince1970,
                "memoryExits": fg.cumulativeMemoryResourceLimitExitCount + bg.cumulativeMemoryResourceLimitExitCount,
                "watchdogExits": fg.cumulativeAppWatchdogExitCount + bg.cumulativeAppWatchdogExitCount,
                "abnormalExits": fg.cumulativeAbnormalExitCount + bg.cumulativeAbnormalExitCount,
            ])
        }
        save(entries)
    }

    func summary() -> [String: Any] {
        let weekAgo = Date().timeIntervalSince1970 - 7 * 86_400
        let recent = stored().filter { (($0["at"] as? Double) ?? 0) >= weekAgo }
        func sum(_ k: String) -> Int { recent.reduce(0) { $0 + (($1[k] as? Int) ?? 0) } }
        return [
            "appCrashes7d": sum("crashes"),
            "appHangs7d": sum("hangs"),
            "memoryExits7d": sum("memoryExits"),
            "watchdogExits7d": sum("watchdogExits"),
            "abnormalExits7d": sum("abnormalExits"),
            "note": "Apple delivers these reports once a day, so the last 24 hours may not show yet.",
        ]
    }

    private func stored() -> [[String: Any]] { (UserDefaults.standard.array(forKey: key) as? [[String: Any]]) ?? [] }
    private func save(_ e: [[String: Any]]) { UserDefaults.standard.set(Array(e.suffix(60)), forKey: key) }
}

/// Exposes the checks to the web layer: `Diagnostics.run()`, `setConsent`, `getConsent`.
@objc(DiagnosticsPlugin)
public class DiagnosticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DiagnosticsPlugin"
    public let jsName = "Diagnostics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConsent", returnType: CAPPluginReturnPromise),
    ]

    @objc func run(_ call: CAPPluginCall) {
        Diagnostics.collect(trigger: call.getString("trigger") ?? "manual") { report in
            call.resolve(["report": report])
        }
    }

    @objc func setConsent(_ call: CAPPluginCall) {
        Diagnostics.consent = call.getBool("enabled") ?? false
        call.resolve(["enabled": Diagnostics.consent])
    }

    @objc func getConsent(_ call: CAPPluginCall) {
        call.resolve(["enabled": Diagnostics.consent])
    }
}

/// Registers app-local plugins with the bridge (Main.storyboard points here).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DiagnosticsPlugin())
    }
}
