import { createContext, useContext, useMemo, useState, useEffect } from 'react';

const dict = {
  en: {
    estates: 'Estates',
    pricing: 'Pricing',
    signIn: 'Sign in',
    signOut: 'Sign out',
    counselDesk: 'Counsel desk',
    lifeMap: 'Life Map',
    interview: 'Interview',
    unlockRules: 'Unlock rules',
    unlock: 'Unlock',
    execution: 'Execution',
    counsel: 'Counsel',
    family: 'Family',
    audit: 'Audit',
    emergency: 'Emergency QR',
    housewarming: 'Housewarming',
    review: 'Yearly review',
    expiry: 'Expiry',
    lang: 'हिंदी',
  },
  hi: {
    estates: 'एस्टेट',
    pricing: 'कीमत',
    signIn: 'साइन इन',
    signOut: 'साइन आउट',
    counselDesk: 'वकील डेस्क',
    lifeMap: 'लाइफ़ मैप',
    interview: 'साक्षात्कार',
    unlockRules: 'अनलॉक नियम',
    unlock: 'अनलॉक',
    execution: 'एक्सीक्यूशन',
    counsel: 'वकील',
    family: 'परिवार',
    audit: 'ऑडिट',
    emergency: 'आपातकालीन QR',
    housewarming: 'हाउसवार्मिंग',
    review: 'वार्षिक समीक्षा',
    expiry: 'समाप्ति',
    lang: 'English',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('estate_os_lang') || 'en');
  useEffect(() => {
    localStorage.setItem('estate_os_lang', lang);
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }, [lang]);
  const value = useMemo(
    () => ({
      lang,
      t: (key) => dict[lang][key] || dict.en[key] || key,
      toggle: () => setLang((l) => (l === 'en' ? 'hi' : 'en')),
      setLang,
    }),
    [lang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
