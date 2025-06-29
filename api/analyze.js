// This is a Vercel Serverless Function, which is a standard Node.js environment.

// The master checklist is now a simple constant within our API file.
const masterChecklist = [
    { id: 1, text: "Product name is clearly stated" },
    { id: 2, text: "Net weight or volume is shown" },
    { id: 3, text: "Ingredient list is complete and in descending order by weight" },
    // ... (paste all 18 checklist items here, just like in your Apps Script)
    { id: 18, text: "Provide a brief, one-sentence summary..." }
  ];
  
  // This is the main handler function that Vercel will run.
  export default async function handler(request, response) {
    // --- Handle CORS Preflight OPTIONS Requests ---
    if (request.method === 'OPTIONS') {
      response.status(200).json({ message: 'CORS preflight OK' });
      return;
    }
  
    // --- Set CORS Headers for the actual response ---
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    // We only accept POST requests for analysis
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method Not Allowed' });
    }
  
    try {
      const { image_data, mime_type } = request.body;
  
      if (!image_data || !mime_type) {
        return response.status(400).json({ error: 'Missing required fields: image_data and mime_type' });
      }
  
      // Call our function to get the analysis from Gemini
      const analysis_results = await checkLabelCompliance(image_data, mime_type);
  
      // Send the successful response back to the mobile app
      return response.status(200).json({
        success: true,
        analysis_results: analysis_results
      });
  
    } catch (error) {
      console.error("!!! Top-level error in handler:", error);
      return response.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }
  
  // This function calls the Gemini AI - it's very similar to the Apps Script version
  async function checkLabelCompliance(base64Data, mimeType) {
    // We get the API key from environment variables for security
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = "gemini-2.5-flash"; // A stable model for this task
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const instructions = masterChecklist.map(p => `${p.id}. ${p.text}`).join('\n\n');
    const prompt = `You are a food label analysis API... (paste your full, detailed prompt here)`; // Use the same detailed prompt as before
  
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
  
    console.log("Calling Gemini AI...");
    const geminiResponse = await fetch(apiUrl, options);
    const responseData = await geminiResponse.json();
  
    if (!geminiResponse.ok) {
      console.error("Gemini API Error:", responseData);
      throw new Error(responseData.error?.message || 'Failed to get a response from the AI service.');
    }
  
    // Extract the JSON from the AI's text response
    const aiText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      throw new Error("The AI returned an empty response.");
    }
  
    const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
    if (jsonMatch && (jsonMatch[1] || jsonMatch[2])) {
      const extractedJson = jsonMatch[1] || jsonMatch[2];
      return JSON.parse(extractedJson); // Return the final results
    } else {
      throw new Error("The AI returned a response in an unexpected format.");
    }
  }