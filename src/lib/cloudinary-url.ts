export function optimizedCloudinaryImageUrl(url?: string | null, width = 900) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url ?? "";
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width},c_limit/`);
}
