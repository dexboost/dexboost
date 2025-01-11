import { config as prodConfig } from './config.prod';
import { config as devConfig } from './config.dev';

export const config = process.env.NODE_ENV === 'production' ? prodConfig : devConfig;
