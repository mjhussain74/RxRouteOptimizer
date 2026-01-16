import crypto from 'crypto';

interface NormalizedAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  normalizedHash: string;
  fullAddress: string;
}

const streetAbbreviations: Record<string, string> = {
  'st': 'street',
  'st.': 'street',
  'ave': 'avenue',
  'ave.': 'avenue',
  'rd': 'road',
  'rd.': 'road',
  'blvd': 'boulevard',
  'blvd.': 'boulevard',
  'dr': 'drive',
  'dr.': 'drive',
  'ln': 'lane',
  'ln.': 'lane',
  'ct': 'court',
  'ct.': 'court',
  'pl': 'place',
  'pl.': 'place',
  'cir': 'circle',
  'cir.': 'circle',
  'way': 'way',
  'pkwy': 'parkway',
  'pkwy.': 'parkway',
  'hwy': 'highway',
  'hwy.': 'highway',
  'n': 'north',
  'n.': 'north',
  's': 'south',
  's.': 'south',
  'e': 'east',
  'e.': 'east',
  'w': 'west',
  'w.': 'west',
  'apt': 'apartment',
  'apt.': 'apartment',
  'ste': 'suite',
  'ste.': 'suite',
  '#': 'unit',
};

export function normalizeStreet(street: string): string {
  let normalized = street.toLowerCase().trim();
  
  // Replace multiple spaces with single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Expand abbreviations
  const words = normalized.split(' ');
  const expandedWords = words.map(word => {
    const lookup = streetAbbreviations[word];
    return lookup || word;
  });
  
  return expandedWords.join(' ');
}

export function normalizeCity(city: string): string {
  return city.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeState(state: string): string {
  return state.toUpperCase().trim();
}

export function normalizeZip(zip: string): string {
  // Extract first 5 digits
  const match = zip.match(/(\d{5})/);
  return match ? match[1] : zip.trim();
}

export function normalizeAddress(
  streetAddress: string,
  city: string,
  state: string,
  zipCode: string
): NormalizedAddress {
  const normalizedStreet = normalizeStreet(streetAddress);
  const normalizedCity = normalizeCity(city);
  const normalizedState = normalizeState(state);
  const normalizedZip = normalizeZip(zipCode);
  
  // Create canonical address key for hashing
  const canonicalKey = `${normalizedStreet}|${normalizedCity}|${normalizedState}|${normalizedZip}`;
  
  // Generate SHA256 hash
  const normalizedHash = crypto.createHash('sha256').update(canonicalKey).digest('hex');
  
  // Create full address for display
  const fullAddress = `${streetAddress.trim()}, ${city.trim()}, ${state.trim()} ${zipCode.trim()}`;
  
  return {
    streetAddress: streetAddress.trim(),
    city: city.trim(),
    state: normalizedState,
    zipCode: normalizedZip,
    normalizedHash,
    fullAddress,
  };
}

export function parseAddressComponents(fullAddress: string): {
  street: string;
  city: string;
  state: string;
  zip: string;
} | null {
  // Try to parse "123 Main St, Detroit, MI 48212" format
  const patterns = [
    // Standard: Street, City, ST ZIP
    /^(.+?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i,
    // No comma between city and state: Street, City ST ZIP
    /^(.+?),\s*([^,]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i,
  ];
  
  for (const pattern of patterns) {
    const match = fullAddress.match(pattern);
    if (match) {
      return {
        street: match[1].trim(),
        city: match[2].trim(),
        state: match[3].toUpperCase(),
        zip: match[4],
      };
    }
  }
  
  return null;
}

export function generateDeliveryIdentifier(sequence: number): string {
  const year = new Date().getFullYear();
  const paddedSequence = sequence.toString().padStart(6, '0');
  return `DEL${year}${paddedSequence}`;
}
