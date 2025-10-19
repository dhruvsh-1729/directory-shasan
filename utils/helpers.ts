export const convertCase = (str: string | undefined) => {
    if(!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
} 

const ABBREVIATIONS: Record<string, string> = {
    G: 'GuruBhakt',
    SP: 'Sansari Parivarjan',
    GM: 'Gruh Mandir',
    AS: 'Anya Samuday',
    VIP: 'Very Important Person'
};

export const expandAbbreviations = (str: string | undefined) => {
    if (!str) return '';
    return str.replace(/\b(GM|SP|AS|G|VIP)\b/g, match => ABBREVIATIONS[match] || match);
};

export const expandAbbreviationList = (str: string | undefined): string[] => {
    if (!str) return [];
    return str.split(',')
        .map(s => s.trim())
        .map(expandAbbreviations);
};