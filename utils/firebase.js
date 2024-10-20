const admin = require("firebase-admin");
const serviceAccount = Buffer.from(
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  "base64"
).toString("utf-8");

const parsedServiceAccount = JSON.parse(serviceAccount);
admin.initializeApp({
  credential: admin.credential.cert(parsedServiceAccount),
  storageBucket: "pharmcie-de-la-pointe-a10d5.appspot.com",
});

const bucket = admin.storage().bucket();

async function uploadToFirebase(fileData, fileName, mimeType) {
  try {
    const file = bucket.file(fileName);

    await file.save(fileData, {
      contentType: mimeType,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });

    const encodedFileName = encodeURIComponent(fileName);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedFileName}?alt=media`;

    return url;
  } catch (error) {
    console.error("Error uploading to Firebase:", error);
    throw new Error("Failed to upload file to Firebase");
  }
}
async function uploadToFirebaseManually(file) {
  try {
    const fileName = Date.now() + "_" + file.originalname;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });
    const encodedFileName = encodeURIComponent(fileName);
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedFileName}?alt=media`;
    return url;
  } catch (error) {
    console.error("Error uploading to Firebase:", error);
    throw new Error("Failed to upload file to Firebase");
  }
}

async function deleteFromFirebase(fileUrl) {
  try {
    const fileName = decodeURIComponent(
      fileUrl.split("/o/")[1].split("?alt=media")[0]
    );
    const file = bucket.file(fileName);
    const [exists] = await file.exists();

    if (!exists) {
      console.warn(`File ${fileName} not found in Firebase Storage.`);
      return false;
    }

    await file.delete();
    console.log(`File ${fileName} deleted from Firebase Storage`);

    return true;
  } catch (error) {
    console.error("Error deleting file from Firebase:", error);
    throw new Error("Failed to delete file from Firebase");
  }
}

module.exports = {
  uploadToFirebase,
  deleteFromFirebase,
  uploadToFirebaseManually,
};
