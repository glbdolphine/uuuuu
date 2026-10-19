import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LoginScreen } from './components/LoginScreen';
import { AppUser } from './types';
import { getCurrentUser, onAuthChange, signOut } from './utils/auth';
import './index.css';

function Root() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [openAdminPanelOnLoad, setOpenAdminPanelOnLoad] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((current) => {
        if (mounted) {
          setUser(current);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = onAuthChange((current) => {
      if (mounted) setUser(current);
    });

    return () => {
      mounted = false;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#eef8f1] flex items-center justify-center text-sm text-slate-500">
        Loading Pace IT…
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onUnlock={setUser}
        onAdminUnlock={(admin) => {
          setUser(admin);
          setOpenAdminPanelOnLoad(true);
        }}
      />
    );
  }

  return (
    <App
      currentUser={user}
      initialAdminPanelOpen={openAdminPanelOnLoad}
      onLock={async () => {
        setOpenAdminPanelOnLoad(false);
        await signOut();
        setUser(null);
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
