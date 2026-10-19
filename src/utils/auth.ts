import { AppUser } from '../types';

const LAST_USER_KEY = 'pace_it_last_user_v2';

export function cleanUserName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function getLastUser(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastUser(name: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, name);
  } catch {
    /* ignore */
  }
}

const authListeners = new Set<(user: AppUser | null) => void>();

function notifyAuthChange(user: AppUser | null) {
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

function forgetTabState(): void {
  try {
    sessionStorage.removeItem('pace_it_view');
    sessionStorage.removeItem('pace_it_editing');
  } catch {
    /* ignore */
  }
}

export async function login(username: string, password: string): Promise<AppUser> {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized || !password) throw new Error('Username and password are required.');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username: normalized, password }),
  });

  if (!res.ok) {
    let msg = 'Invalid username or password.';
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      // not json
    }
    throw new Error(msg);
  }

  const { user } = await res.json();
  // The session token lives only in the server's HttpOnly cookie. The page never sees it.
  setLastUser(user.username);
  forgetTabState();
  notifyAuthChange(user);
  return user;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function changePassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    let msg = 'Could not change password.';
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function updateUserProfile(data: {
  displayName?: string;
  phoneNumber?: string;
  email?: string;
  photoUrl?: string;
}): Promise<AppUser> {
  const res = await fetch('/api/auth/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let msg = 'Could not update profile.';
    try {
      const json = await res.json();
      if (json.error) msg = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const result = await res.json();
  const user = result.user as AppUser;
  notifyAuthChange(user);
  return user;
}

export async function getAccessToken(): Promise<string> {
  return '';
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  forgetTabState();
  notifyAuthChange(null);
}

export function onAuthChange(callback: (user: AppUser | null) => void) {
  authListeners.add(callback);
  // Initial fire
  getCurrentUser().then((u) => callback(u)).catch(() => callback(null));
  return () => {
    authListeners.delete(callback);
  };
}