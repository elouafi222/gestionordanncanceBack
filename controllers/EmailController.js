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
});

function openInbox(cb) {
  imap.openBox("INBOX", false, cb);
}

module.exports.receiveEmail = asyncHandler(async (req, res) => {
  let emailsProcessed = []; // Track processed emails

  imap.once("ready", function () {
    openInbox(async (err, box) => {
      if (err) {
        console.error("Error opening inbox:", err);
        return res
          .status(500)
          .json({ success: false, error: "Failed to open inbox" });
      }

      imap.search(["UNSEEN"], async (err, results) => {
        if (err) {
          console.error("Search error:", err);
        }

        if (!results || !results.length) {
          console.log("No unread emails found");
        }

        try {
          const f = imap.fetch(results, { bodies: "", struct: true });

          const processEmailPromises = [];

          f.on("message", (msg, seqno) => {
            console.log("Processing email #%d", seqno);

            let uid = null;
            msg.on("attributes", (attrs) => {
              uid = attrs.uid;
              console.log(`Attributes for email UID ${uid}:`, attrs);
            });

            msg.on("body", (stream, info) => {
              const processEmail = async () => {
                try {
                  const parsed = await simpleParser(stream);
                  const { from, attachments } = parsed;
                  const sender = from.text;

                  const emailMatch = sender.match(/<([^>]+)>/);
                  const emailOnly = emailMatch ? emailMatch[1] : sender;

                  console.log(`Processing email from: ${emailOnly}`);

                  if (attachments && attachments.length > 0) {
                    const attachmentPromises = attachments.map(async (att) => {
                      try {
                        const url = await uploadToFirebase(
                          att.content,
                          att.filename,
                          att.contentType
                        );

                        const { error } = validateSaveMessage({
                          sender: emailOnly,
                          url,
                        });
                        if (error) {
                          console.error(
                            "Validation error:",
                            error.details[0].message
                          );
                          return null;
                        }

                        const newMessage = new message({
                          sender: emailOnly,
                          type: "Email",
                          url,
                        });

                        await newMessage.save();

                        console.log(
                          `Processed email from: ${emailOnly} with attachment uploaded to ${url}`
                        );

                        return {
                          filename: att.filename,
                          size: att.size,
                          url,
                        };
                      } catch (uploadErr) {
                        console.error("Error uploading attachment:", uploadErr);
                        return null;
                      }
                    });

                    const processedAttachments = await Promise.all(
                      attachmentPromises
                    );

                    emailsProcessed.push({
                      from: emailOnly,
                      attachments: processedAttachments.filter(Boolean),
                    });
                  } else {
                    console.log(
                      `No attachments found in email from: ${emailOnly}`
                    );
                  }

                  // Mark the email as seen after processing it (regardless of attachments)
                  imap.addFlags(uid, "\\Seen", (err) => {
                    if (err) {
                      console.error(
                        `Error marking email UID ${uid} as seen:`,
                        err
                      );
                    } else {
                      console.log(`Marked email UID ${uid} as seen`);
                    }
                  });
                } catch (parseError) {
                  console.error("Error processing email body:", parseError);
                }
              };

              processEmail();
            });

            msg.once("end", () => {
              console.log("Finished processing email");
            });
          });

          f.once("error", (fetchError) => {
            console.error("Fetch error:", fetchError);
            return res
              .status(500)
              .json({ success: false, error: "Failed to fetch emails" });
          });

          f.once("end", async () => {
            console.log("Done fetching all messages");
            await Promise.all(processEmailPromises);
          });
        } catch (fetchGeneralError) {
          console.error("General fetch error:", fetchGeneralError);
        }
      });
    });
  });

  imap.once("error", (err) => {
    console.error("IMAP error:", err);
  });

  imap.once("end", () => {
    console.log("IMAP connection closed");
  });

  imap.connect();
});

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
