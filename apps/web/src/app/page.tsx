import { HeroSection } from "@/components/landing/hero-section"
import { FeaturesSection } from "@/components/landing/features-section"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[var(--background)] flex flex-col overflow-hidden selection:bg-[var(--accent)] selection:text-white">
      {/* Abstract Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[var(--accent)] blur-[120px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[var(--text-1)] blur-[120px] opacity-5 pointer-events-none" />

      <Navbar />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 sm:px-12 md:px-24">
        <HeroSection />
        <FeaturesSection />
      </main>

      <Footer />
    </div>
  )
}
