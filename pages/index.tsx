import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import ContactDirectoryApp from "@/components/ContactDirectoryApp";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <div
      className={`${geistSans.className} ${geistMono.className} min-h-screen w-full flex items-center justify-center bg-gray-50`}
    >
      <ContactDirectoryApp />
    </div>
  );
}
