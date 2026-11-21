import type { AppThemePreset } from '../types.ts';

export interface ThemePresetDefinition {
  id: AppThemePreset;
  order: number;
  name: string;
  tagline: string;
  description: string;
  badge?: string;
  swatches: {
    bg: string;
    surface: string;
    accent: string;
    accent2: string;
    text: string;
  };
  darkVars: {
    primary: string;
    secondary: string;
    bg: string;
    card: string;
    border: string;
    text: string;
    button: string;
  };
  lightVars: {
    primary: string;
    secondary: string;
    bg: string;
    card: string;
    border: string;
    text: string;
    button: string;
  };
}

export const APP_THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'red',
    order: 1,
    name: 'Red',
    tagline: 'Classic Old Red Alert (Default)',
    description:
      'Original Study Blunder obsidian-charcoal interface with sharp Red Alert (#FF2525) tactical accents and metallic borders.',
    badge: 'DEFAULT',
    swatches: {
      bg: '#090909',
      surface: '#1D1D1D',
      accent: '#FF2525',
      accent2: '#FF762E',
      text: '#F5F5F5',
    },
    darkVars: {
      primary: '#FF2525',
      secondary: '#C90000',
      bg: '#090909',
      card: '#1D1D1D',
      border: '#454545',
      text: '#F5F5F5',
      button: '#FF2525',
    },
    lightVars: {
      primary: '#DC2626',
      secondary: '#B91C1C',
      bg: '#F7F7F8',
      card: '#FFFFFF',
      border: '#D4D4D8',
      text: '#18181B',
      button: '#DC2626',
    },
  },
  {
    id: 'yellow',
    order: 2,
    name: 'Yellow',
    tagline: 'Solar Amber & Obsidian',
    description:
      'High-visibility warm yellow accents (#FACC15) paired with deep warm-charcoal panels for sharp contrast.',
    swatches: {
      bg: '#0B0A06',
      surface: '#221F12',
      accent: '#FACC15',
      accent2: '#EAB308',
      text: '#FEFCE8',
    },
    darkVars: {
      primary: '#FACC15',
      secondary: '#CA8A04',
      bg: '#0B0A06',
      card: '#221F12',
      border: '#4D4523',
      text: '#FEFCE8',
      button: '#FACC15',
    },
    lightVars: {
      primary: '#B45309',
      secondary: '#92400E',
      bg: '#FEFCE8',
      card: '#FFFFFF',
      border: '#E5D796',
      text: '#1C1917',
      button: '#B45309',
    },
  },
  {
    id: 'pale_white_pink',
    order: 3,
    name: 'Pale White with Pink',
    tagline: 'Soft Porcelain White & Rose Pink',
    description:
      'Clean pale white canvas (#FFF7FA) with pure white cards, soft blush borders, and crisp rose-pink accents (#E11D74).',
    swatches: {
      bg: '#FFF7FA',
      surface: '#FFFFFF',
      accent: '#E11D74',
      accent2: '#F472B6',
      text: '#2D1120',
    },
    darkVars: {
      primary: '#E11D74',
      secondary: '#BE185D',
      bg: '#FFF7FA',
      card: '#FFFFFF',
      border: '#F3C4D7',
      text: '#2D1120',
      button: '#E11D74',
    },
    lightVars: {
      primary: '#DB2777',
      secondary: '#BE185D',
      bg: '#FFF9FB',
      card: '#FFFFFF',
      border: '#F5CADC',
      text: '#2D1120',
      button: '#DB2777',
    },
  },
  {
    id: 'blue',
    order: 4,
    name: 'Blue',
    tagline: 'Midnight Cobalt & Electric Blue',
    description:
      'Deep cobalt-slate surfaces paired with clean electric blue highlights (#3B82F6) for focused study sessions.',
    swatches: {
      bg: '#070E1C',
      surface: '#17284A',
      accent: '#3B82F6',
      accent2: '#60A5FA',
      text: '#F1F6FF',
    },
    darkVars: {
      primary: '#3B82F6',
      secondary: '#1D4ED8',
      bg: '#070E1C',
      card: '#17284A',
      border: '#2B4678',
      text: '#F1F6FF',
      button: '#2563EB',
    },
    lightVars: {
      primary: '#1D4ED8',
      secondary: '#1E40AF',
      bg: '#F3F7FD',
      card: '#FFFFFF',
      border: '#C2D6F2',
      text: '#0A1A36',
      button: '#1D4ED8',
    },
  },
  {
    id: 'emerald',
    order: 5,
    name: 'Emerald Cyber',
    tagline: 'Curated Studio Pick — Deep Pine & Mint Emerald',
    description:
      'Calm, eye-friendly dark obsidian-pine surfaces with crisp emerald green accents (#10B981) built for long late-night study.',
    badge: 'STUDIO PICK',
    swatches: {
      bg: '#07120D',
      surface: '#142E23',
      accent: '#10B981',
      accent2: '#34D399',
      text: '#ECFDF5',
    },
    darkVars: {
      primary: '#10B981',
      secondary: '#059669',
      bg: '#07120D',
      card: '#142E23',
      border: '#23523D',
      text: '#ECFDF5',
      button: '#10B981',
    },
    lightVars: {
      primary: '#047857',
      secondary: '#065F46',
      bg: '#F2FBF7',
      card: '#FFFFFF',
      border: '#BCE3D2',
      text: '#062419',
      button: '#047857',
    },
  },
];

export function getThemePresetDefinition(preset?: string | null): ThemePresetDefinition {
  const clean = (preset || 'red').trim().toLowerCase();
  return APP_THEME_PRESETS.find((t) => t.id === clean) || APP_THEME_PRESETS[0];
}
