export function randomBytes(n: number): {
  toString(enc?: string): string;
} {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return {
    toString(enc?: string) {
      if (enc === "base64url") {
        let bin = "";
        buf.forEach((b) => {
          bin += String.fromCharCode(b);
        });
        return btoa(bin)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }
      return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },
  };
}
