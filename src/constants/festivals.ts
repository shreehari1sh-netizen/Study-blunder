export type FestivalId =
  | 'diwali'
  | 'holi'
  | 'sharad_navratri'
  | 'dussehra'
  | 'ganesh_chaturthi'
  | 'krishna_janmashtami'
  | 'ram_navami'
  | 'mahashivratri'
  | 'makar_sankranti'
  | 'raksha_bandhan'
  | 'durga_puja'
  | 'dev_deepawali'
  | 'govardhan_puja'
  | 'republic_day'
  | 'independence_day';

export type FestivalTargetScreen = 'home' | 'vip' | 'profile';
export type FestivalAnimationSpeed = 'slow' | 'normal' | 'fast';
export type FestivalDecorationSize = 'small' | 'medium' | 'large';
export type FestivalParticleIntensity = 'low' | 'medium' | 'high';
export type FestivalParticleSize = 'small' | 'normal';

export interface FestivalCustomAssets {
  banner_image_url?: string;
  top_left_url?: string;
  top_right_url?: string;
  bottom_left_url?: string;
  bottom_right_url?: string;
  floating_element_url?: string;
}

export interface FestivalDecorationConfig {
  id: FestivalId;
  name: string;
  icon: string;
  tagline: string;
  is_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  manual_off_override: boolean;
  banner_enabled: boolean;
  banner_text: string;
  banner_subtitle: string;
  corners_enabled: boolean;
  floating_enabled: boolean;
  border_enabled: boolean;
  glow_enabled: boolean;
  animation_enabled: boolean;
  animation_speed: FestivalAnimationSpeed;
  decoration_size: FestivalDecorationSize;
  particle_intensity: FestivalParticleIntensity;
  particle_size: FestivalParticleSize;
  particle_speed: FestivalAnimationSpeed;
  particle_density: number;
  opacity: number;
  target_screens: FestivalTargetScreen[];
  custom_assets: FestivalCustomAssets;
  primary_accent: string;
  secondary_accent: string;
  updated_at: string;
}

export interface ActiveFestivalResponse {
  global_enabled: boolean;
  active_festival_id: FestivalId | null;
  active_source: 'manual' | 'schedule' | null;
  festival: FestivalDecorationConfig | null;
  version: number;
  server_time: string;
  timezone: string;
}

export interface AdminFestivalManagerResponse {
  global_enabled: boolean;
  active_festival_id: FestivalId | null;
  active_source: 'manual' | 'schedule' | null;
  active_festival: FestivalDecorationConfig | null;
  festivals: FestivalDecorationConfig[];
  version: number;
  server_time: string;
  timezone: string;
}

export const FESTIVAL_ORDER: FestivalId[] = [
  'diwali',
  'holi',
  'sharad_navratri',
  'dussehra',
  'ganesh_chaturthi',
  'krishna_janmashtami',
  'ram_navami',
  'mahashivratri',
  'makar_sankranti',
  'raksha_bandhan',
  'durga_puja',
  'dev_deepawali',
  'govardhan_puja',
  'republic_day',
  'independence_day',
];

export const FESTIVAL_PARTICLE_DESCRIPTIONS: Record<FestivalId, string> = {
  diwali: 'Colourful 2D rockets (Red, Green, Blue, Golden, Pink & Purple) launching upward with glowing trails and bursting into matching 12–24 particle fireworks',
  holi: 'Small colourful gulal particles, soft colour splashes & gently floating powder puffs',
  sharad_navratri: 'Small marigold & lotus flower petals, glowing mini diyas & subtle garba mirror particles',
  dussehra: 'Small glowing golden arrows gliding gently, golden sparkles & victory motifs',
  ganesh_chaturthi: 'Small hibiscus & marigold flower petals, miniature modak elements & gentle golden sparkles',
  krishna_janmashtami: 'Small iridescent peacock feathers, golden bansuri flute particles & tiny flower petals',
  ram_navami: 'Small fluttering saffron flags, subtle golden sparkles & gentle bow-arrow motifs',
  mahashivratri: 'Small glowing trishul particles, sacred three-leaf bilva leaves & subtle blue-purple aura orbs',
  makar_sankranti: 'Small colourful diamond kites floating gently across the sky with subtle movement',
  raksha_bandhan: 'Small ornate decorative rakhis, colourful silk mauli threads & floating flower petals',
  durga_puja: 'Small red hibiscus & white shiuli petals, dhak-inspired rhythm motifs & golden sparkles',
  dev_deepawali: 'Small floating ghat diyas, warm golden light particles & subtle water glow reflections',
  govardhan_puja: 'Small marigold & tulsi petals, fresh green leaves & nature-inspired floating particles',
  republic_day: 'Small saffron, white & green tricolour particles with subtle rotating Ashoka Chakra emblems',
  independence_day: 'Small tricolour particles, gently floating miniature Tiranga flags & patriotic sparkles',
};

const DEFAULT_UPDATED_AT = '2025-01-01T00:00:00.000Z';

export const DEFAULT_FESTIVAL_CATALOG: Record<FestivalId, FestivalDecorationConfig> = {
  diwali: {
    id: 'diwali',
    name: 'Diwali',
    icon: '🪔',
    tagline: 'Glowing diyas, rangoli corners, hanging lanterns & golden light garland',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Diwali',
    banner_subtitle: 'May the Festival of Lights illuminate your path to knowledge & success',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F59E0B',
    secondary_accent: '#FDE047',
    updated_at: DEFAULT_UPDATED_AT,
  },
  holi: {
    id: 'holi',
    name: 'Holi',
    icon: '🎨',
    tagline: 'Vibrant gulal powder clouds, color splash corners & pichkari droplets',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Holi',
    banner_subtitle: 'Wishing you a joyful Festival of Colors filled with bright learning moments',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 15,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#EC4899',
    secondary_accent: '#38BDF8',
    updated_at: DEFAULT_UPDATED_AT,
  },
  sharad_navratri: {
    id: 'sharad_navratri',
    name: 'Sharad Navratri',
    icon: '🪷',
    tagline: 'Mangal kalash, marigold & ashoka leaf toran, corner aarti diyas & dandiya motifs',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Shubh Navratri',
    banner_subtitle: 'May Maa Durga bless your studies with wisdom, strength & devotion',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F97316',
    secondary_accent: '#EF4444',
    updated_at: DEFAULT_UPDATED_AT,
  },
  dussehra: {
    id: 'dussehra',
    name: 'Dussehra (Vijayadashami)',
    icon: '🏹',
    tagline: 'Golden bow & arrow emblems, marigold victory garlands & ceremonial arches',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Dussehra • Shubh Vijayadashami',
    banner_subtitle: 'Celebrating the victory of truth, wisdom, and perseverance',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F59E0B',
    secondary_accent: '#EA580C',
    updated_at: DEFAULT_UPDATED_AT,
  },
  ganesh_chaturthi: {
    id: 'ganesh_chaturthi',
    name: 'Ganesh Chaturthi',
    icon: '🙏',
    tagline: 'Sacred Ganesha motif, modak & red hibiscus corners, marigold toran & temple lamps',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Ganpati Bappa Morya • Happy Ganesh Chaturthi',
    banner_subtitle: 'May Lord Ganesha remove all obstacles and bless you with supreme intellect',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#FB923C',
    secondary_accent: '#EF4444',
    updated_at: DEFAULT_UPDATED_AT,
  },
  krishna_janmashtami: {
    id: 'krishna_janmashtami',
    name: 'Krishna Janmashtami',
    icon: '🦚',
    tagline: 'Peacock feathers, golden bansuri flute, hanging dahi-handi matkis & morpankh glow',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Shubh Janmashtami',
    banner_subtitle: 'May divine melodies of knowledge and grace guide your journey',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#14B8A6',
    secondary_accent: '#FACC15',
    updated_at: DEFAULT_UPDATED_AT,
  },
  ram_navami: {
    id: 'ram_navami',
    name: 'Ram Navami',
    icon: '🚩',
    tagline: 'Fluttering saffron flags, golden bow & arrow motifs, temple garlands & Suryavanshi glow',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Shubh Ram Navami',
    banner_subtitle: 'Wishing you righteousness, discipline, and unwavering focus',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F97316',
    secondary_accent: '#FBBF24',
    updated_at: DEFAULT_UPDATED_AT,
  },
  mahashivratri: {
    id: 'mahashivratri',
    name: 'Mahashivratri',
    icon: '🔱',
    tagline: 'Sacred Trishul & Damru emblems, Bilva leaf garlands, brass temple bells & crescent glow',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Har Har Mahadev • Shubh Mahashivratri',
    banner_subtitle: 'May Lord Shiva grant you inner peace, clarity, and supreme concentration',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#818CF8',
    secondary_accent: '#E2E8F0',
    updated_at: DEFAULT_UPDATED_AT,
  },
  makar_sankranti: {
    id: 'makar_sankranti',
    name: 'Makar Sankranti',
    icon: '🪁',
    tagline: 'Colorful diamond kites with string arcs, radiant Uttarayan sun & harvest accents',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Makar Sankranti',
    banner_subtitle: 'Soar high toward your goals like vibrant kites in the Uttarayan sky',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 12,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F59E0B',
    secondary_accent: '#06B6D4',
    updated_at: DEFAULT_UPDATED_AT,
  },
  raksha_bandhan: {
    id: 'raksha_bandhan',
    name: 'Raksha Bandhan',
    icon: '🎀',
    tagline: 'Ornate silk & pearl rakhi medallions, sacred red-gold mauli threads & festive sparkles',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Raksha Bandhan',
    banner_subtitle: 'Celebrating the sacred bond of protection, trust, and togetherness',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F43F5E',
    secondary_accent: '#FBBF24',
    updated_at: DEFAULT_UPDATED_AT,
  },
  durga_puja: {
    id: 'durga_puja',
    name: 'Durga Puja',
    icon: '🌺',
    tagline: 'Traditional red-and-white alpana corners, lotus & kash phool motifs, dhunuchi & pandal lights',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Subho Sharodiya • Happy Durga Puja',
    banner_subtitle: 'May Maa Durga illuminate your mind with courage, joy, and excellence',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#E11D48',
    secondary_accent: '#FDE047',
    updated_at: DEFAULT_UPDATED_AT,
  },
  dev_deepawali: {
    id: 'dev_deepawali',
    name: 'Dev Deepawali',
    icon: '🪔',
    tagline: 'Kashi ghat steps lined with glowing diyas, rising sky-lanterns & river light reflections',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Shubh Dev Deepawali',
    banner_subtitle: 'Celebrating the sacred Festival of Lights of the Gods on Kartik Purnima',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#F59E0B',
    secondary_accent: '#FB923C',
    updated_at: DEFAULT_UPDATED_AT,
  },
  govardhan_puja: {
    id: 'govardhan_puja',
    name: 'Govardhan Puja',
    icon: '🐄',
    tagline: 'Sacred Govardhan hill & Kamdhenu cow motif, tulsi & marigold garlands & Braj accents',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Shubh Govardhan Puja & Annakut',
    banner_subtitle: 'May divine grace bring abundance, gratitude, and harmony to your life',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 13,
    opacity: 0.9,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#10B981',
    secondary_accent: '#F59E0B',
    updated_at: DEFAULT_UPDATED_AT,
  },
  republic_day: {
    id: 'republic_day',
    name: 'Republic Day',
    icon: '🇮🇳',
    tagline: 'Saffron, white & green ceremonial ribbons, 24-spoke Ashoka Chakra & tricolour bunting',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Republic Day • Jai Hind',
    banner_subtitle: 'Saluting the spirit of the Indian Constitution, unity, and progress',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#FF9933',
    secondary_accent: '#138808',
    updated_at: DEFAULT_UPDATED_AT,
  },
  independence_day: {
    id: 'independence_day',
    name: 'Independence Day',
    icon: '🇮🇳',
    tagline: 'Flowing Tiranga silk waves, fluttering national flag, Ashoka Chakra & patriotic sparkles',
    is_enabled: false,
    start_at: null,
    end_at: null,
    manual_off_override: false,
    banner_enabled: true,
    banner_text: 'Happy Independence Day • Vande Mataram',
    banner_subtitle: 'Celebrating freedom, dedication, and the power of education for our nation',
    corners_enabled: true,
    floating_enabled: true,
    border_enabled: true,
    glow_enabled: true,
    animation_enabled: true,
    animation_speed: 'normal',
    decoration_size: 'medium',
    particle_intensity: 'medium',
    particle_size: 'normal',
    particle_speed: 'normal',
    particle_density: 14,
    opacity: 0.92,
    target_screens: ['home', 'vip', 'profile'],
    custom_assets: {},
    primary_accent: '#FF9933',
    secondary_accent: '#138808',
    updated_at: DEFAULT_UPDATED_AT,
  },
};

export function isValidFestivalId(id: unknown): id is FestivalId {
  return typeof id === 'string' && (FESTIVAL_ORDER as string[]).includes(id);
}

export function getDefaultFestivalConfig(id: FestivalId): FestivalDecorationConfig {
  const base = DEFAULT_FESTIVAL_CATALOG[id];
  return {
    ...base,
    target_screens: [...base.target_screens],
    custom_assets: { ...base.custom_assets },
  };
}

export function normalizeSingleFestivalConfig(
  id: FestivalId,
  raw?: Partial<FestivalDecorationConfig> | null
): FestivalDecorationConfig {
  const def = getDefaultFestivalConfig(id);
  if (!raw || typeof raw !== 'object') return def;

  const validScreens: FestivalTargetScreen[] = Array.isArray(raw.target_screens)
    ? (raw.target_screens.filter((s) => s === 'home' || s === 'vip' || s === 'profile') as FestivalTargetScreen[])
    : def.target_screens;

  const speed: FestivalAnimationSpeed =
    raw.animation_speed === 'slow' || raw.animation_speed === 'normal' || raw.animation_speed === 'fast'
      ? raw.animation_speed
      : def.animation_speed;

  const size: FestivalDecorationSize =
    raw.decoration_size === 'small' || raw.decoration_size === 'medium' || raw.decoration_size === 'large'
      ? raw.decoration_size
      : def.decoration_size;

  const particleIntensity: FestivalParticleIntensity =
    raw.particle_intensity === 'low' || raw.particle_intensity === 'medium' || raw.particle_intensity === 'high'
      ? raw.particle_intensity
      : def.particle_intensity;

  const particleSize: FestivalParticleSize =
    raw.particle_size === 'small' || raw.particle_size === 'normal'
      ? raw.particle_size
      : def.particle_size;

  const particleSpeed: FestivalAnimationSpeed =
    raw.particle_speed === 'slow' || raw.particle_speed === 'normal' || raw.particle_speed === 'fast'
      ? raw.particle_speed
      : speed;

  const rawDensity =
    typeof raw.particle_density === 'number' && Number.isFinite(raw.particle_density)
      ? Math.round(raw.particle_density)
      : def.particle_density;
  const clampedDensity = Math.min(24, Math.max(4, rawDensity));

  const numOpacity = typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? raw.opacity : def.opacity;
  const clampedOpacity = Math.min(1, Math.max(0.25, Number(numOpacity.toFixed(2))));

  const rawAssets = raw.custom_assets && typeof raw.custom_assets === 'object' ? raw.custom_assets : {};
  const cleanAsset = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/uploads/') || trimmed.startsWith('/')) {
      return trimmed;
    }
    return undefined;
  };

  const normalizeDateStr = (val: unknown): string | null => {
    if (!val || typeof val !== 'string') return null;
    const ms = new Date(val).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  };

  return {
    ...def,
    id,
    name: def.name, // Always preserve the canonical 15 festival names
    icon: def.icon, // Always preserve the canonical icon
    tagline: def.tagline,
    is_enabled: Boolean(raw.is_enabled),
    start_at: normalizeDateStr(raw.start_at),
    end_at: normalizeDateStr(raw.end_at),
    manual_off_override: Boolean(raw.manual_off_override),
    banner_enabled: raw.banner_enabled !== undefined ? Boolean(raw.banner_enabled) : def.banner_enabled,
    banner_text:
      typeof raw.banner_text === 'string' && raw.banner_text.trim().length > 0
        ? raw.banner_text.trim().slice(0, 100)
        : def.banner_text,
    banner_subtitle:
      typeof raw.banner_subtitle === 'string'
        ? raw.banner_subtitle.trim().slice(0, 180)
        : def.banner_subtitle,
    corners_enabled: raw.corners_enabled !== undefined ? Boolean(raw.corners_enabled) : def.corners_enabled,
    floating_enabled: raw.floating_enabled !== undefined ? Boolean(raw.floating_enabled) : def.floating_enabled,
    border_enabled: raw.border_enabled !== undefined ? Boolean(raw.border_enabled) : def.border_enabled,
    glow_enabled: raw.glow_enabled !== undefined ? Boolean(raw.glow_enabled) : def.glow_enabled,
    animation_enabled: raw.animation_enabled !== undefined ? Boolean(raw.animation_enabled) : def.animation_enabled,
    animation_speed: speed,
    decoration_size: size,
    particle_intensity: particleIntensity,
    particle_size: particleSize,
    particle_speed: particleSpeed,
    particle_density: clampedDensity,
    opacity: clampedOpacity,
    target_screens: validScreens.length > 0 ? validScreens : ['home', 'vip', 'profile'],
    custom_assets: {
      ...(cleanAsset(rawAssets.banner_image_url) && { banner_image_url: cleanAsset(rawAssets.banner_image_url) }),
      ...(cleanAsset(rawAssets.top_left_url) && { top_left_url: cleanAsset(rawAssets.top_left_url) }),
      ...(cleanAsset(rawAssets.top_right_url) && { top_right_url: cleanAsset(rawAssets.top_right_url) }),
      ...(cleanAsset(rawAssets.bottom_left_url) && { bottom_left_url: cleanAsset(rawAssets.bottom_left_url) }),
      ...(cleanAsset(rawAssets.bottom_right_url) && { bottom_right_url: cleanAsset(rawAssets.bottom_right_url) }),
      ...(cleanAsset(rawAssets.floating_element_url) && { floating_element_url: cleanAsset(rawAssets.floating_element_url) }),
    },
    primary_accent: def.primary_accent,
    secondary_accent: def.secondary_accent,
    updated_at: typeof raw.updated_at === 'string' && raw.updated_at ? raw.updated_at : def.updated_at,
  };
}

export function normalizeAllFestivalConfigs(
  rawMap?: Record<string, Partial<FestivalDecorationConfig>> | null
): Record<FestivalId, FestivalDecorationConfig> {
  const result = {} as Record<FestivalId, FestivalDecorationConfig>;
  let foundEnabled: FestivalId | null = null;

  for (const id of FESTIVAL_ORDER) {
    const normalized = normalizeSingleFestivalConfig(id, rawMap?.[id]);
    // Enforce single active festival invariant at normalization time
    if (normalized.is_enabled) {
      if (!foundEnabled) {
        foundEnabled = id;
      } else {
        normalized.is_enabled = false;
      }
    }
    result[id] = normalized;
  }
  return result;
}

/**
 * Converts an ISO timestamp string to an IST `datetime-local` input string (`YYYY-MM-DDTHH:mm`)
 * using `Asia/Kolkata` (+05:30).
 */
export function isoToIstDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // IST is UTC + 5 hours 30 minutes
  const istMs = d.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  return istDate.toISOString().slice(0, 16);
}

/**
 * Converts an IST `datetime-local` input value (`YYYY-MM-DDTHH:mm`) or ISO string into a canonical UTC ISO string.
 */
export function istDatetimeLocalToIso(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // If it already includes a timezone offset or Z, parse directly
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Otherwise interpret YYYY-MM-DDTHH:mm as Asia/Kolkata (+05:30)
  const withOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00+05:30`
    : `${trimmed}+05:30`;
  const parsed = new Date(withOffset);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatIstScheduleLabel(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not set';
  try {
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(d) + ' IST'
    );
  } catch {
    return d.toLocaleString() + ' IST';
  }
}
