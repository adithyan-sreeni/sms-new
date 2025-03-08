const express = require("express");
const admin = require("firebase-admin");
const twilio = require("twilio");
require("dotenv").config();

const app = express();
app.use(express.json()); // Ensure JSON parsing
app.use(express.urlencoded({ extended: false }));

// Initialize Firebase from environment variable
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null;

if (!serviceAccount) {
    console.error("Firebase service account is not set in environment variables.");
    process.exit(1); // Exit if service account is not available
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

// Handle incoming SMS
app.post("/sms", async (req, res) => {
    try {
        const fromNumber = req.body.From;
        const pincode = req.body.Body.trim(); // Extract pincode from SMS

        if (!fromNumber || !pincode) {
            return res.status(400).send("Missing required fields.");
        }

        // Save the incoming SMS to Firestore
        await db.collection("smsLogs").add({
            from: fromNumber,
            body: pincode,
            receivedAt: admin.firestore.FieldValue.serverTimestamp() // Save the timestamp
        });
        console.log("SMS received:", fromNumber, pincode);

        const querySnapshot = await db.collection("jobs").where("pincode", "==", pincode).get();
        let replyMessage = "Sorry, no information available for this pincode.";

        if (!querySnapshot.empty) {
            const jobData = querySnapshot.docs.map(doc => doc.data());
            for (const job of jobData) {
                replyMessage = `Job Name: ${job.jobName}\nDescription: ${job.description}\nAddress: ${job.address}\nPhone: ${job.phone}\nWage: ${job.wage}\nWork Type: ${job.workType}`;

                // Send reply SMS
                await twilioClient.messages.create({
                    body: replyMessage,
                    from: twilioNumber,
                    to: fromNumber
                });
                console.log("SMS sent:", replyMessage);
            }
        } else {
            // Send default reply SMS if no matching documents are found
            await twilioClient.messages.create({
                body: replyMessage,
                from: twilioNumber,
                to: fromNumber
            });
            console.log("SMS sent:", replyMessage);
        }

        res.status(200).send("Message processed.");
    } catch (error) {
        console.error("Error processing SMS:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Add this route to handle GET requests to the root URL
app.get("/", (req, res) => {
    res.send("Server is running. Use /sms to send SMS.");
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));