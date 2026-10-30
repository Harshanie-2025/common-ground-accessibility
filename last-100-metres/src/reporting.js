const patterns = {
  tact: /tactile|blind|braille|टैक्टाइल|दृष्टि|ಅಂಧ/i,
  ramp: /ramp|curb|slope|रैंप|ढलान|ಇಳಿಜಾರು/i,
  pot: /pothole|गड्ढा|गड्ढे|ಗುಂಡಿ/i,
  drain: /drain|manhole|sewer|नाला|गटर|ಚರಂಡಿ/i,
  enc: /encroach|vendor|parked|अतिक्रमण|ठेला|ಅತಿಕ್ರಮಣ|ವ್ಯಾಪಾರಿ/i,
  narrow: /narrow|blocked|pole|संकरा|खंभा|ಕಿರಿದಾದ|ಕಂಬ/i,
  dark: /light|dark|lamp|अंधेरा|बत्ती|ಕತ್ತಲೆ|ದೀಪ/i,
  slab: /slab|tile|footpath|pavement|broken|टूटा|स्लैब|फुटपाथ|ಸ್ಲ್ಯಾಬ್|ಒಡೆದ/i,
};

export function guessIssueCategory(description) {
  return Object.keys(patterns).find((category) => patterns[category].test(description)) || null;
}
