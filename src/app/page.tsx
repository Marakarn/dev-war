import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div 
      className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]"
      style={{
        backgroundImage: 'url(/redBG.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start bg-white/90 backdrop-blur-sm p-8 rounded-lg shadow-lg">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold mb-4">Dev War Queue System</h1>
          <p className="text-lg text-gray-600 mb-6">
            Get an access key and join the queue to access our exclusive checkout area
          </p>
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <Link
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white gap-2 hover:bg-blue-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="/waitingQueue"
          >
            Join Waiting Queue
          </Link>
          <Link
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
            href="/checkout"
          >
            Go to Checkout
          </Link>
          
          {/* TEST LINK - REMOVE IN PRODUCTION */}
          {process.env.NODE_ENV === 'development' && (
            <Link
              className="rounded-full border border-solid border-orange-500 bg-orange-500 text-white transition-colors flex items-center justify-center hover:bg-orange-600 font-medium text-xs sm:text-sm h-8 sm:h-10 px-3 sm:px-4 w-full sm:w-auto"
              href="/admin-test"
            >
              🧪 Test Queue Admin
            </Link>
          )}
        </div>

        <div className="text-sm text-gray-500 max-w-md text-center sm:text-left">
          <p>
            This demo shows a queue-based system where users get an auto-generated access key and wait in line before accessing a session-protected checkout page.
          </p>
        </div>
      </main>
    </div>
  );
}
