import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hatchx",
    short_name: "Hatchx",
    description: "Bayside High School clubs, activities, events, and opportunities.",
    start_url: "/",
    display: "standalone",
    background_color: "#080d20",
    theme_color: "#263a99",
    orientation: "portrait-primary",
    icons: [
      { src: "/brand-logo-light.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand-logo-dark.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
