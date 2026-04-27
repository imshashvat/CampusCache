import { Link } from "@tanstack/react-router";
import { Library } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-background mt-32">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <Library className="h-5 w-5" />
              </div>
              <span className="font-serif text-2xl">CampusCache</span>
            </div>
            <p className="mt-4 max-w-md text-sm text-muted-foreground leading-relaxed">
              The student-run vault for notes, slides, labs and PYQs that
              <span className="italic-serif text-mint"> actually carry you through the semester</span>. Built by students, for students.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/browse" className="hover:text-mint">Browse library</Link></li>
              <li><Link to="/contribute" className="hover:text-mint">Contribute</Link></li>
              <li><Link to="/contact" className="hover:text-mint">Contact us</Link></li>
              <li><Link to="/auth" search={{ redirect: "/" }} className="hover:text-mint">Sign in</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">About</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>100% free, forever</li>
              <li>Student-curated</li>
              <li>No tracking, no fluff</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-border/60 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground font-mono">© {new Date().getFullYear()} CampusCache · made with care</p>
          <p className="text-xs text-muted-foreground italic-serif">knowledge belongs to everyone</p>
        </div>
      </div>
    </footer>
  );
}
