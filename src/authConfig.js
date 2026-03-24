export const msalConfig = {
  auth: {
    clientId: '79722400-3699-4f12-a4a1-df71949b5805',
    authority: 'https://login.microsoftonline.com/c8bd84c5-4ddb-4cb7-8276-0b7d30a42e5f',
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'https://staff.dhwebsiteservices.co.uk',
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
}

export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
}
