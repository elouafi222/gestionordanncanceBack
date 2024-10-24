const Imap = require("node-imap");
const { simpleParser } = require("mailparser");
const asyncHandler = require("express-async-handler");
const { uploadToFirebase } = require("../utils/firebase");
const { validateSaveMessage, message } = require("../models/message");
const sendEmail = require("../utils/sendEmail");

const imap = new Imap({
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASS,
  host: "imap.gmail.com",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  connTimeout: 30000,
  debug: (msg) => console.log("[IMAP DEBUG]:", msg), 
});

function openInbox(cb) {
  imap.openBox("INBOX", false, cb);
}

module.exports.receiveEmail = async () => {
  let emailsProcessed = [];

  imap.once("ready", function () {
    openInbox(async (err, box) => {
      if (err) {
        console.error("Error opening inbox:", err);
        return;
      }

      imap.search(["UNSEEN"], async (err, results) => {
        if (err) {
          console.error("Search error:", err);
          return;
        }

        if (!results || !results.length) {
          console.log("No unread emails found");
          return;
        }

        try {
          const fetch = imap.fetch(results, { bodies: "", struct: true });

          fetch.on("message", (msg, seqno) => {
            console.log("Processing email #%d", seqno);
            let uid = null;

            msg.on("attributes", (attrs) => {
              uid = attrs.uid;
              console.log(`Attributes for email UID ${uid}:`, attrs);
            });

            msg.on("body", (stream) => {
              msg.once("end", () => {
                if (uid) {
                  handleEmailProcessing(stream, uid, emailsProcessed);
                } else {
                  console.error("UID not found, cannot process email.");
                }
              });
            });

            msg.once("end", () => {
              console.log("Finished processing email");
            });
          });

          fetch.once("error", (fetchError) => {
            console.error("Fetch error:", fetchError);
          });

          fetch.once("end", () => {
            console.log("Done fetching all messages");
            console.log("Emails Processed:", emailsProcessed);
            imap.end(); // Gracefully close connection after fetch
          });
        } catch (fetchError) {
          console.error("General fetch error:", fetchError);
        }
      });
    });
  });

  imap.once("error", (err) => {
    console.error("IMAP error:", err);

    // Handle ECONNRESET and other connection errors
    if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
      console.log("Reconnecting due to error...");
      setTimeout(() => imap.connect(), 5000); // Retry after 5 seconds
    }
  });

  imap.once("end", () => {
    console.log("IMAP connection closed");
    clearInterval(imap.idleInterval); // Ensure keep-alive is cleared
  });

  // Enable keep-alive with Gmail
  imap.idleInterval = setInterval(() => {
    console.log("Sending NOOP to keep connection alive");
    imap.noop(); // Sends NOOP command to keep the connection active
  }, 30000); // Send every 30 seconds

  // Connect to the IMAP server
  imap.connect();
};

// Helper function to process individual emails
async function handleEmailProcessing(stream, uid, emailsProcessed) {
  if (!uid) {
    console.error("Cannot mark email as seen. UID is null.");
    return;
  }

  try {
    const parsed = await simpleParser(stream);
    const { from, attachments } = parsed;
    const emailOnly = from.text.match(/<([^>]+)>/)?.[1] || from.text;

    console.log(`Processing email from: ${emailOnly}`);

    if (attachments && attachments.length > 0) {
      const processedAttachments = await processAttachments(
        attachments,
        emailOnly
      );
      emailsProcessed.push({
        from: emailOnly,
        attachments: processedAttachments,
      });
    } else {
      console.log(`No attachments found in email from: ${emailOnly}`);
    }

    // Mark the email as seen
    imap.addFlags(uid, "\\Seen", (err) => {
      if (err) {
        console.error(`Error marking email UID ${uid} as seen:`, err);
      } else {
        console.log(`Marked email UID ${uid} as seen`);
      }
    });
  } catch (error) {
    console.error("Error processing email body:", error);
  }
}

// Helper function to process attachments
async function processAttachments(attachments, emailOnly) {
  const attachmentPromises = attachments.map(async (att) => {
    try {
      const url = await uploadToFirebase(
        att.content,
        att.filename,
        att.contentType
      );

      const { error } = validateSaveMessage({ sender: emailOnly, url });
      if (error) {
        console.error("Validation error:", error.details[0].message);
        return null;
      }

      const newMessage = new message({ sender: emailOnly, type: "Email", url });
      await newMessage.save();

      console.log(
        `Processed email from: ${emailOnly} with attachment uploaded to ${url}`
      );

      return { filename: att.filename, size: att.size, url };
    } catch (uploadErr) {
      console.error("Error uploading attachment:", uploadErr);
      return null;
    }
  });

  const processedAttachments = await Promise.all(attachmentPromises);
  return processedAttachments.filter(Boolean);
}

// Send Email Handler
module.exports.sendEmail = asyncHandler(async (req, res) => {
  const { email, sujet, message, ordNumero } = req.body;

  if (!email || !message || !sujet) {
    return res
      .status(400)
      .json({ error: "Email adresse, Sujet and message are required." });
  }

  const context = {
    ordNumero: ordNumero,
    subject: sujet,
    message: message,
  };

  await sendEmail(email, sujet, "response", context);
  res.status(201).json("La message a été envoyer avec succès.");
});
