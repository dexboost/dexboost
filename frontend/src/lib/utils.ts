import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatNumber = (num: number | undefined | null) => {
  if (num === undefined || num === null) return '$0.00';
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
};

export const getSocialIcon = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'website':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    case 'twitter':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="24" viewBox="0 0 11 24" fill="#FFF"><path d="M9.282 1H10.992L7.255 5.27L11.649 11.079H8.21L5.515 7.555L2.43 11.08H0.721L4.716 6.513L0.5 1H4.028L6.464 4.22L9.282 1ZM8.682 10.056H9.629L3.513 1.97H2.497L8.682 10.056Z"></path></svg>';
    case 'telegram':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FFF"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';
    case 'pumpfun':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 11 11" fill="#FFF"><path d="M5.92039 1.3088C6.99879 0.230399 8.74723 0.230399 9.82569 1.3088C10.904 2.38721 10.904 4.13565 9.82569 5.21405L7.873 7.16667L3.96777 3.26142L5.92039 1.3088Z" fill="currentColor"></path><path d="M5.34857 9.69375C4.27017 10.7722 2.52173 10.7722 1.44333 9.69375C0.36492 8.61537 0.36492 6.86694 1.44333 5.78854L3.39596 3.83594L7.30119 7.74116L5.34857 9.69375Z" fill="currentColor"></path></svg>';
    case 'solscan':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="#FFF"><g clip-path="url(#clip0_7285_39158)"><path d="M6.01636 4.00009C7.13373 4.01022 8.01559 4.91214 7.99979 6.02777C7.98393 7.1438 7.0732 8.02421 5.96028 7.99949C4.85998 7.97516 3.99715 7.0927 4.00001 5.99492C4.00286 4.8797 4.90179 3.98995 6.01636 4.00009Z" fill="currentColor"></path><path d="M9.09457 11.0489C7.02966 12.7106 3.33988 12.1159 1.42869 9.87967C-0.673669 7.41975 -0.428175 3.72916 1.98302 1.54378C4.36487 -0.614703 8.04984 -0.495668 10.2963 1.81258C12.4769 4.05314 12.5735 7.7706 10.5326 9.86864C10.0561 9.36989 9.57918 8.87024 9.07918 8.34705C9.85297 7.26616 10.0927 6.02924 9.63014 4.70113C8.93944 2.71831 6.7516 1.67194 4.75634 2.34776C2.78465 3.01542 1.7054 5.13647 2.32113 7.1332C2.94361 9.15202 5.05512 10.2987 7.0816 9.67664C7.485 9.55282 7.70888 9.62527 7.96969 9.92527C8.31455 10.3227 8.71368 10.6731 9.09457 11.0489Z" fill="currentColor"></path></g><defs><clipPath id="clip0_7285_39158"><rect width="12" height="12" fill="white"></rect></clipPath></defs></svg>';
    default:
      return '';
  }
}; 