// Constants for Page Builder

const FONT_LIST = [
    'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
    'Playfair Display', 'Merriweather', 'Oswald', 'Raleway',
    'Nunito', 'Quicksand', 'Work Sans', 'Source Sans Pro',
    'Titillium Web', 'Josefin Sans', 'Ubuntu', 'Dancing Script',
    'Pacifico', 'Shadows Into Light', 'Great Vibes'
];

const MAX_HISTORY = 50;

const ANCHOR_STYLES = {
    'tl': { justifyContent: 'flex-start', alignItems: 'flex-start' },
    'tc': { justifyContent: 'center', alignItems: 'flex-start' },
    'tr': { justifyContent: 'flex-end', alignItems: 'flex-start' },
    'ml': { justifyContent: 'flex-start', alignItems: 'center' },
    'mc': { justifyContent: 'center', alignItems: 'center' },
    'mr': { justifyContent: 'flex-end', alignItems: 'center' },
    'bl': { justifyContent: 'flex-start', alignItems: 'flex-end' },
    'bc': { justifyContent: 'center', alignItems: 'flex-end' },
    'br': { justifyContent: 'flex-end', alignItems: 'flex-end' },
};

const DEVICE_SCALES = {
    'desktop': 0.4,
    'tablet': 0.5,
    'phone': 0.6
};

export { FONT_LIST, MAX_HISTORY, ANCHOR_STYLES, DEVICE_SCALES };
