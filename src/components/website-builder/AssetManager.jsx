import { useState, useEffect, useRef } from 'react'
import { Upload, Search, FolderOpen, Image as ImageIcon, Video, FileText, Trash2, X, Check } from 'lucide-react'
import useAssets from '../../hooks/website-builder/useAssets'
import { Modal } from '../Modal'

export default function AssetManager({ isOpen, onClose, onSelectAsset, selectionMode = false }) {
  const {
    loading,
    uploading,
    uploadAsset,
    uploadMultipleAssets,
    getAssets,
    deleteAsset,
    getFolders
  } = useAssets()

  const [assets, setAssets] = useState([])
  const [folders, setFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('all')
  const [selectedAssets, setSelectedAssets] = useState([])
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      loadAssets()
      loadFolders()
    }
  }, [isOpen, selectedFolder, fileTypeFilter, searchQuery])

  const loadAssets = async () => {
    const filters = {}
    if (selectedFolder !== null) filters.folder = selectedFolder
    if (fileTypeFilter !== 'all') filters.file_type = fileTypeFilter
    if (searchQuery) filters.search = searchQuery

    const { data } = await getAssets(filters)
    setAssets(data)
  }

  const loadFolders = async () => {
    const { data } = await getFolders()
    setFolders(data)
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    await uploadMultipleAssets(files, {
      folder: selectedFolder || '',
      optimize: true
    })

    loadAssets()
    fileInputRef.current.value = ''
  }

  const handleDelete = async (assetId) => {
    await deleteAsset(assetId)
    setDeleteConfirm(null)
    loadAssets()
  }

  const handleAssetClick = (asset) => {
    if (selectionMode && onSelectAsset) {
      onSelectAsset(asset)
      onClose()
    } else {
      // Toggle selection
      if (selectedAssets.includes(asset.id)) {
        setSelectedAssets(selectedAssets.filter(id => id !== asset.id))
      } else {
        setSelectedAssets([...selectedAssets, asset.id])
      }
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const filteredAssets = assets

  const stats = {
    all: assets.length,
    images: assets.filter(a => a.file_type === 'image').length,
    videos: assets.filter(a => a.file_type === 'video').length,
    documents: assets.filter(a => a.file_type === 'document').length
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Asset Manager"
      size="large"
    >
      <div className="asset-manager">
        {/* Header Actions */}
        <div className="asset-manager-header">
          <div className="asset-manager-filters">
            <button
              className={`filter-btn ${fileTypeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFileTypeFilter('all')}
            >
              All ({stats.all})
            </button>
            <button
              className={`filter-btn ${fileTypeFilter === 'image' ? 'active' : ''}`}
              onClick={() => setFileTypeFilter('image')}
            >
              <ImageIcon size={14} />
              Images ({stats.images})
            </button>
            <button
              className={`filter-btn ${fileTypeFilter === 'video' ? 'active' : ''}`}
              onClick={() => setFileTypeFilter('video')}
            >
              <Video size={14} />
              Videos ({stats.videos})
            </button>
            <button
              className={`filter-btn ${fileTypeFilter === 'document' ? 'active' : ''}`}
              onClick={() => setFileTypeFilter('document')}
            >
              <FileText size={14} />
              Docs ({stats.documents})
            </button>
          </div>

          <div className="asset-manager-actions">
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="asset-folders">
            <button
              className={`folder-btn ${selectedFolder === null ? 'active' : ''}`}
              onClick={() => setSelectedFolder(null)}
            >
              <FolderOpen size={14} />
              All Assets
            </button>
            {folders.map(folder => (
              <button
                key={folder}
                className={`folder-btn ${selectedFolder === folder ? 'active' : ''}`}
                onClick={() => setSelectedFolder(folder)}
              >
                <FolderOpen size={14} />
                {folder}
              </button>
            ))}
          </div>
        )}

        {/* Asset Grid */}
        <div className="asset-grid">
          {loading ? (
            <div className="asset-loading">
              <div className="spin" />
              <div>Loading assets...</div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="asset-empty">
              <Upload size={48} style={{ color: 'var(--faint)' }} />
              <h3>No assets yet</h3>
              <p>Upload images, videos, or documents to get started</p>
              <button
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                Upload Files
              </button>
            </div>
          ) : (
            filteredAssets.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedAssets.includes(asset.id)}
                onClick={() => handleAssetClick(asset)}
                onDelete={() => setDeleteConfirm(asset)}
                selectionMode={selectionMode}
              />
            ))
          )}
        </div>

        {/* Delete Confirmation */}
        {deleteConfirm && (
          <Modal
            isOpen={true}
            onClose={() => setDeleteConfirm(null)}
            title="Delete Asset"
          >
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{deleteConfirm.original_filename}</strong>?</p>
              <p style={{ fontSize: 13, color: 'var(--sub)', marginTop: 8 }}>
                This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(deleteConfirm.id)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </Modal>
        )}
      </div>

      <style>{`
        .asset-manager {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 70vh;
        }

        .asset-manager-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .asset-manager-filters {
          display: flex;
          gap: 4px;
          background: var(--bg2);
          padding: 3px;
          border-radius: 8px;
        }

        .filter-btn {
          padding: 6px 12px;
          border: none;
          background: transparent;
          color: var(--sub);
          font-size: 13px;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .filter-btn:hover {
          background: var(--bg);
          color: var(--text);
        }

        .filter-btn.active {
          background: var(--bg);
          color: var(--accent);
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .asset-manager-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .asset-folders {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }

        .folder-btn {
          padding: 6px 12px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--sub);
          font-size: 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .folder-btn:hover {
          border-color: var(--accent);
          color: var(--text);
        }

        .folder-btn.active {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }

        .asset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
          overflow-y: auto;
          max-height: 500px;
          padding: 4px;
        }

        .asset-loading,
        .asset-empty {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          text-align: center;
        }

        .asset-empty h3 {
          margin: 0;
          font-size: 18px;
          color: var(--text);
        }

        .asset-empty p {
          margin: 0;
          font-size: 14px;
          color: var(--sub);
        }
      `}</style>
    </Modal>
  )
}

function AssetCard({ asset, isSelected, onClick, onDelete, selectionMode }) {
  const isImage = asset.file_type === 'image'
  const isVideo = asset.file_type === 'video'

  return (
    <div
      className={`asset-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {isSelected && (
        <div className="asset-check">
          <Check size={14} />
        </div>
      )}

      <div className="asset-preview">
        {isImage ? (
          <img src={asset.storage_url} alt={asset.original_filename} />
        ) : isVideo ? (
          <video src={asset.storage_url} />
        ) : (
          <FileText size={32} style={{ color: 'var(--faint)' }} />
        )}
      </div>

      <div className="asset-info">
        <div className="asset-name" title={asset.original_filename}>
          {asset.original_filename}
        </div>
        <div className="asset-size">
          {asset.file_size_bytes && formatFileSize(asset.file_size_bytes)}
        </div>
      </div>

      {!selectionMode && (
        <button
          className="asset-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 size={12} />
        </button>
      )}

      <style>{`
        .asset-card {
          position: relative;
          background: var(--bg);
          border: 2px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
        }

        .asset-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .asset-card.selected {
          border-color: var(--accent);
          background: var(--accent-soft);
        }

        .asset-check {
          position: absolute;
          top: 6px;
          right: 6px;
          background: var(--accent);
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .asset-preview {
          aspect-ratio: 1;
          background: var(--bg2);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .asset-preview img,
        .asset-preview video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .asset-info {
          padding: 8px;
        }

        .asset-name {
          font-size: 11px;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 2px;
        }

        .asset-size {
          font-size: 10px;
          color: var(--faint);
        }

        .asset-delete {
          position: absolute;
          top: 6px;
          right: 6px;
          background: rgba(239, 68, 68, 0.9);
          color: white;
          border: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: none;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }

        .asset-card:hover .asset-delete {
          display: flex;
        }

        .asset-delete:hover {
          background: rgba(220, 38, 38, 1);
        }
      `}</style>
    </div>
  )
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
