const nodemailer = require("nodemailer");
const path = require("path");

module.exports = async (userEmail, subject, template, context) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const { default: hbs } = await import("nodemailer-express-handlebars");

    const handlebarsOptions = {
      viewEngine: {
        defaultLayout: false,
      },
      viewPath: path.join(__dirname, "../views"),
    };

    transporter.use("compile", hbs(handlebarsOptions));

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: subject,
      template: template,
      context: context,
      attachments: [
        {
          filename: "logo.png",
          path: path.join(__dirname, "logo.png"),
          cid: "logo",
        },
      ],
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
  } catch (error) {
    console.log(error);
    throw new Error("Internal Server Error (nodemailer)");
  }
};
