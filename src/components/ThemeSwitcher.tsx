//app/components/ThemeSwitcher.tsx
'use client';

import { useState, useEffect } from 'react';

// All daisyUI v5 themes
const DAISYUI_THEMES = [
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 
  'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua', 
  'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 
  'cmyk', 'autumn', 'business', 'acid', 'lemonade', 'night', 'coffee', 
  'winter', 'dim', 'nord', 'sunset', 'procyon', 'shadow'
] as const;

type Theme = typeof DAISYUI_THEMES[number];

export default function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<Theme>('corporate');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Load saved theme from localStorage
    const savedTheme = localStorage.getItem('daisyui-theme') as Theme;
    if (savedTheme && DAISYUI_THEMES.includes(savedTheme)) {
      setCurrentTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const changeTheme = (theme: Theme) => {
    setCurrentTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('daisyui-theme', theme);
    setIsOpen(false);
  };

  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-ghost btn-sm gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="w-4 h-4 stroke-current">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 014 4h4a2 2 0 002-2V5z" />
        </svg>
        <span className="hidden sm:inline">{currentTheme}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={`w-4 h-4 stroke-current transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </label>
      
      <ul tabIndex={0} className="dropdown-content menu menu-compact p-2 shadow bg-base-100 rounded-box w-110 max-h-96 overflow-y-auto">
        <li className="menu-title">
          <span>Choose Theme</span>
        </li>
        {DAISYUI_THEMES.map((theme) => (
          <li key={theme}>
            <a
              className={`${currentTheme === theme ? 'active' : ''}`}
              onClick={() => changeTheme(theme)}
            >
              <span className="capitalize">{theme.replace('-', ' ')}</span>
              {currentTheme === theme && (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}