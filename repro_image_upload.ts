
import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';

async function testUpload() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API_KEY is not set in environment.");
        process.exit(1);
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. Create a dummy image file
    const imagePath = 'test_image.png';
    // Create a 1x1 transparent PNG
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    fs.writeFileSync(imagePath, buffer);

    // 2. Create a temporary store
    const storeName = "Test Image Store " + Date.now();
    console.log(`Creating store: ${storeName}`);
    const store = await ai.fileSearchStores.create({ config: { displayName: storeName } });
    console.log(`Store created: ${store.name}`);

    try {
        // 3. Try to upload the image
        console.log("Attempting to upload image...");

        // Simulating the File object use in the browser environment if possible, 
        // but since we are in node, we might need to pass the file path or Buffer.
        // The SDK in Node supports file path string.

        const op = await ai.fileSearchStores.uploadToFileSearchStore({
            file: imagePath, // Passing path in Node
            fileSearchStoreName: store.name!,
            config: {
                displayName: "test_image.png",
                // mimeType: "image/png" // SDK might auto-detect
            }
        });

        console.log("Upload initiated. Waiting...");
        // Wait for operation... (simplified, usually we poll)
        // actually uploadToFileSearchStore returns an Operation, need to poll?
        // The type signature says Promise<UploadToFileSearchStoreOperation>

        // Let's just catch the immediate error.
        console.log("Upload operation returned:", op);

    } catch (e: any) {
        console.error("Upload Failed!");
        console.error("Error Code:", e.code || e.status);
        console.error("Error Message:", e.message);
        console.error("Full Error:", JSON.stringify(e, null, 2));
    } finally {
        // Cleanup
        console.log("Cleaning up store...");
        await ai.fileSearchStores.delete({ name: store.name!, config: { force: true } });
        fs.unlinkSync(imagePath);
    }
}

testUpload();
