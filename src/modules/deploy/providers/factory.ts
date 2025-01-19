import { IDeployProvider } from './interface.js';
import { VercelProvider } from './vercel.js';

export class ProviderFactory {
    static create(providerType: string): IDeployProvider {
        switch (providerType.toLowerCase()) {
            case 'vercel':
                return new VercelProvider();
            default:
                throw new Error(`Provider type not supported: ${providerType}`);
        }
    }
}