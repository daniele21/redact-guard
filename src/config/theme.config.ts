import config from '@/config.json';

export const PII_CATEGORIES: Record<string, {color: string, icon: string, label: string}> = config.ui.pii_categories;
