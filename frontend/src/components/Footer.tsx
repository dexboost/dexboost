export function Footer() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container flex flex-col items-center gap-4 md:h-24 md:flex-row md:justify-between">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built by{" "}
            DexBoost.
            Full{" "}
            <a
              href="https://dexboost.gitbook.io/dexboost/"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              documentation
            </a>.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://x.com/dexboostxyz"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
              <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
            </svg>
            <span className="sr-only">X (Twitter)</span>
          </a>
          <a
            href="https://t.me/dexboostxyz"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 12 12" 
              fill="none"
              className="h-5 w-5"
            >
              <g clipPath="url(#clip0_12893_33676)">
                <mask id="mask0_12893_33676" maskUnits="userSpaceOnUse" x="0" y="0" width="12" height="12" style={{maskType: "luminance"}}>
                  <path d="M12 0H0V12H12V0Z" fill="white" />
                </mask>
                <g mask="url(#mask0_12893_33676)">
                  <path d="M11.8939 1.90992L10.0939 10.3969C9.9599 10.9969 9.6039 11.1429 9.1019 10.8619L6.3599 8.84192L5.0379 10.1149C4.8909 10.2619 4.7679 10.3849 4.4869 10.3849L4.6829 7.59192L9.7639 2.99992C9.9839 2.80392 9.7139 2.69292 9.4199 2.88992L3.1379 6.84392L0.429897 5.99992C-0.158103 5.81692 -0.170103 5.41192 0.551897 5.13092L11.1339 1.05292C11.6239 0.869924 12.0519 1.16292 11.8939 1.90992Z" fill="currentColor" />
                </g>
              </g>
              <defs>
                <clipPath id="clip0_12893_33676">
                  <rect width="12" height="12" fill="white" />
                </clipPath>
              </defs>
            </svg>
            <span className="sr-only">Telegram</span>
          </a>
          <a
            href="https://github.com/dexboost"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            <span className="sr-only">GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer; 