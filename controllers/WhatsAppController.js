const asyncHandler = require("express-async-handler");
const axios = require("axios");
const { message: Message, validateSaveMessage } = require("../models/message");
const { uploadToFirebase } = require("../utils/firebase");
module.exports.sendMessage = asyncHandler(async (req, res) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    return res
      .status(400)
      .json({ error: "Phone number and message are required." });
  }

  try {
    const fullMessage = `${message}\n\nCet message a été envoyé par l'équipe de la Pharmacie de la Pointe.`;
    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: fullMessage,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json("La message a été envoyer avec succès.");
  } catch (error) {
    console.error(
      "Error sending message:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ success: false, error: "Failed to send message." });
  }
});
module.exports.verifyWebhook = asyncHandler(async (req, res) => {
  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(400);
  }
});

module.exports.receiveMessage = asyncHandler(async (req, res) => {
  console.log("Incoming webhook: " + JSON.stringify(req.body));
  try {
    const changes = req.body.entry[0].changes[0];
    const firstMessage = changes.value.messages[0];
    const sender = firstMessage.from;
    const messageId = firstMessage.id;

    if (firstMessage.type === "document" || firstMessage.type === "image") {
      const fileId = firstMessage[firstMessage.type].id;
      const fileName =
        firstMessage[firstMessage.type].filename || `file_${messageId}`;
      const fileMimeType = firstMessage[firstMessage.type].mime_type;
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v20.0/${fileId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        }
      );

      const mediaUrl = mediaResponse.data.url;
      const fileResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "User-Agent": "curl/7.64.1",
        },
      });
      const url = await uploadToFirebase(
        fileResponse.data,
        fileName,
        fileMimeType
      );
      const { error } = validateSaveMessage({ sender: sender, url });
      if (error) {
        console.error("Validation error:", error.details[0].message);
        return res
          .status(400)
          .json({ success: false, error: error.details[0].message });
      }

      const newMessage = new Message({
        sender: sender,
        type: "WhatsApp",
        url,
      });

      await newMessage.save();
      res.status(200).json({
        success: true,
        message: "Message saved successfully.",
        newMessage,
      });
    } else {
      res
        .status(400)
        .json({ success: false, error: "Unsupported message type." });
    }
  } catch (err) {
    console.error("Error processing the message:", err.message);
    res.status(500).json({ success: false, error: "Internal server error." });
  }
});
