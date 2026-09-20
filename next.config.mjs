/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Avatars are served from the project's public storage bucket. Wildcarded
    // because the hostname differs between the staging and production projects.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
