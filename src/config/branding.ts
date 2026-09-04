import logoMedinex from '../logo_medinex.jpeg';
import logoCoseguroIcon from '../assets/branding/coseguro_icon-512.png';
import coseguroFavicon from '../assets/branding/coseguro_favicon.png';

export interface BrandingConfig {
  id: 'medinex' | 'cosegurototal';
  name: string;
  shortName: string;
  tagline: string;
  subTagline: string;
  logo: string;
  favicon: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgGradient: string;
  navbarBg: string;
  heroBadge: string;
  supportEmail: string;
  supportPhone: string;
  cardBg: string;
}

export const BRANDINGS: Record<'medinex' | 'cosegurototal', BrandingConfig> = {
  medinex: {
    id: 'medinex',
    name: 'Medinex Telemedicina',
    shortName: 'Medinex',
    tagline: 'Plataforma de Telemedicina',
    subTagline: 'Atención médica inmediata las 24hs',
    logo: logoMedinex,
    favicon: '/favicon.ico',
    primaryColor: '#2d7d7d',
    secondaryColor: '#3d9a9a',
    accentColor: '#0ea5e9',
    bgGradient: 'from-teal-900 to-teal-950',
    navbarBg: 'bg-teal-900',
    heroBadge: 'Medinex Pro',
    supportEmail: 'soporte@medinex.com.ar',
    supportPhone: '0800-333-MEDINEX',
    cardBg: 'from-teal-700 via-teal-800 to-teal-900',
  },
  cosegurototal: {
    id: 'cosegurototal',
    name: 'Coseguro Total S.R.L.',
    shortName: 'Coseguro Total',
    tagline: 'El valor de la experiencia',
    subTagline: 'Tu salud, nuestra prioridad. Cobertura médica integral',
    logo: logoCoseguroIcon,
    favicon: coseguroFavicon,
    primaryColor: '#003366',
    secondaryColor: '#0052cc',
    accentColor: '#d90429',
    bgGradient: 'from-[#002244] to-[#001122]',
    navbarBg: 'bg-[#002244]',
    heroBadge: 'Coseguro Total Salud',
    supportEmail: 'consultas@cosegurototal.com.ar',
    supportPhone: '0800-888-COSEGURO',
    cardBg: 'from-[#003366] via-[#002244] to-[#0a1128]',
  },
};

// Determina la marca activa según la variable de entorno VITE_APP_BRAND.
// Si no está definida, por defecto activa 'medinex'.
const ACTIVE_BRAND_ID: 'medinex' | 'cosegurototal' =
  (import.meta.env.VITE_APP_BRAND as 'medinex' | 'cosegurototal') || 'medinex';

export function getBranding(): BrandingConfig {
  return BRANDINGS[ACTIVE_BRAND_ID] || BRANDINGS.medinex;
}
