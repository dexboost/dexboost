import { Config } from './types';

export const config: Config = {
    settings: {
        api_get_timeout: 10000,
        db_name_tracker: '/home/dexboost/database.db',
        frontend_url: 'https://dexboost.xyz',
        api_url: 'https://api.dexboost.xyz'
    },
    rug_check: {
        verbose_log: false
    }
}; 