// utils/uploadAvatar.ts
export async function uploadAvatarFile(file: File, folder = 'contacts/avatars') {
  // If you want to control the public_id, set it here and send it to the signer too:
  // const publicId = `contact_${Date.now()}`;

  const sigRes = await fetch('/api/uploads/cloudinary-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder /*, publicId */ }),
  });
  if (!sigRes.ok) throw new Error('Failed to get signature');
  const { timestamp, signature, cloudName, apiKey /*, publicId: serverPublicId */ } = await sigRes.json();

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  // If you chose to sign a public_id, append it here exactly:
  // form.append('public_id', serverPublicId);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const upRes = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!upRes.ok) {
    const err = await upRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Cloudinary upload failed');
  }
  const json = await upRes.json();
  return { url: json.secure_url as string, publicId: json.public_id as string };
}
