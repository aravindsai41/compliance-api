// This is a Vercel Serverless Function, which is a standard Node.js environment.

const masterChecklist = [
  { id: 1, text: "Product name is clearly stated" },
  { id: 2, text: "Net weight or volume is shown" },
  { id: 3, text: "Ingredient list is complete and in descending order by weight" },
  { id: 4, text: "Verify that ingredients emphasized by the product's name, description, or images have their percentage declared in the ingredient list. The brand name and brand logo should be ignored for this check." },
  { id: 5, text: "Allergens are declared according to PEAL rules (bolded and in plain English)" },
  { id: 6, text: "Batch or lot number is present. If reviewing design artwork where this is often added later, you may mark this 'Unclear' and note that it must be added during final production." },
  { id: 7, text: "Use-by or best-before date is visible. If reviewing design artwork where this is often added later, you may mark this 'Unclear' and note that it must be added during final production." },
  { id: 8, text: "Storage instructions provided if required" },
  { id: 9, text: "Business name and Australian/New Zealand address are shown" },
  { id: 10, text: "Nutrition information panel is present and complete as per FSANZ standards and includes justification for any claims made." },
  { id: 11, text: "Country of origin labelling complies with ACCC CoOL laws: label includes a three-part format — (a) bar chart showing % of Australian ingredients, (b) explanatory text (e.g. \"Made in Australia from at least 80% Australian ingredients\"), and (c) country of origin symbol (e.g.kangaroo logo) if making a \"Made in Australia\" claim. Check legibility, correct layout, and positioning. Simple statements like \"Made in Australia\" without bar chart or logo are not compliant." },
  { id: 12, text: "Font is legible, clear, and meets minimum size" },
  { id: 13, text: "Claims (e.g., Gluten-Free, Organic) are justified and not misleading" },
  { id: 14, text: "Label is free from unapproved therapeutic or health claims" },
  { id: 15, text: "Barcode or QR code does not obstruct critical info" },
  { id: 16, text: "Label complies with general layout and visibility requirements" },
  { id: 17, text: "All compound ingredients (ingredients which require futher ingredients, e.g. mayonnaise, labneh, muesli, custard, fetta) are followed by a breakdown of their sub-ingredients in parentheses (e.g. mayonnaise (oil, egg, vinegar)). If not, verify whether an exemption applies (e.g. used in <5% and not relevant to health, allergen, or nutritional profile)." },
  { id: 18, text: "Provide a brief, one-sentence summary of the overall compliance status based on the findings from checks 1-17." }
];

export default async function handler(request, response) {
// Handle CORS Preflight OPTIONS Requests
if (request.method === 'OPTIONS') {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return response.status(200).json({ message: 'CORS preflight OK' });
}

// Set CORS Headers for the actual response
response.setHeader('Access-Control-Allow-Origin', '*');

if (request.method !== 'POST') {
  return response.status(405).json({ error: 'Method Not Allowed' });
}

try {
  const { image_data, mime_type } = request.body;
  if (!image_data || !mime_type) {
    return response.status(400).json({ error: 'Missing required fields: image_data and mime_type' });
  }
  const analysis_results = await checkLabelCompliance(image_data, mime_type);
  return response.status(200).json({
    success: true,
    analysis_results: analysis_results
  });
} catch (error) {
  console.error("!!! Top-level error in handler:", error);
  return response.status(500).json({ error: 'Internal Server Error', message: error.message });
}
}

async function checkLabelCompliance(base64Data, mimeType) {
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-1.5-flash";
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const instructions = masterChecklist.map(p => `${p.id}. ${p.text}`).join('\n\n');

// This is the full, detailed prompt the AI needs
const prompt = `You are a food label analysis API. Your SOLE function is to return a JSON array based on the provided checklist. Your entire response must be a single, valid JSON array. NEVER include anything before or after the array, including markdown fences like \`\`\`json.

Analyse the provided food label file against the ${masterChecklist.length} points below.
Each object in the array MUST contain exactly these SIX keys: "id", "question", "findings", "compliance", "result", and "confidence".
The "confidence" key must be an integer from 1 (low certainty) to 5 (high certainty).

Example 1 (Pass):
{ "id": 1, "question": "Product name is clearly stated", "findings": "The product name 'Organic Strawberry Yoghurt' is visible at the top of the label.", "compliance": "Pass", "result": "Pass", "confidence": 5 }
Example 2 (Unclear):
{ "id": 6, "question": "Batch or lot number is present. If reviewing design artwork...", "findings": "A batch number is not visible. This is acceptable for an artwork file but must be added for final production.", "compliance": "Unclear", "result": "Unclear", "confidence": 5 }

Now, analyze the label against all the following points and provide the complete JSON array:
${instructions}
`;

const payload = {
  contents: [{
    parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64Data } }
    ]
  }]
};

const options = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
};

console.log("Calling Gemini AI with corrected prompt...");
const geminiResponse = await fetch(apiUrl, options);
const responseData = await geminiResponse.json();

if (!geminiResponse.ok) {
  console.error("Gemini API Error:", responseData);
  throw new Error(responseData.error?.message || 'Failed to get a response from the AI service.');
}

const aiText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
console.log("Raw AI Text Response:", aiText);

if (!aiText) { throw new Error("The AI returned an empty response text."); }

try {
  const firstBracket = aiText.indexOf('[');
  const firstBrace = aiText.indexOf('{');
  let startIndex = -1;
  if (firstBracket === -1) { startIndex = firstBrace; } 
  else if (firstBrace === -1) { startIndex = firstBracket; } 
  else { startIndex = Math.min(firstBracket, firstBrace); }
  if (startIndex === -1) { throw new Error("No JSON object or array found in the AI response."); }
  const lastBrace = aiText.lastIndexOf('}');
  const lastBracket = aiText.lastIndexOf(']');
  const endIndex = Math.max(lastBrace, lastBracket);
  if (endIndex === -1) { throw new Error("Could not find the end of the JSON object or array."); }
  const jsonString = aiText.substring(startIndex, endIndex + 1);
  return JSON.parse(jsonString);
} catch (e) {
  console.error("Failed to parse JSON from AI response.", e);
  throw new Error("The AI returned a response in an unexpected format.");
}
}