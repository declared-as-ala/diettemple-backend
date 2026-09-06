import path from 'path';

// public/ is included in both the source checkout and the production Docker image.
export const dietTempleLogoPath = path.resolve(__dirname, '../../public/images/diettemple-logo.png');
export const dietTempleLogoCid = 'diettemple-logo@diettemple.tn';
