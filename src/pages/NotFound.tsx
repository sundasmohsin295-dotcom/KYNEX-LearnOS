import { motion } from "framer-motion";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { KynexMark } from "@/components/brand/KynexBrand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center"
    >
      <KynexMark className="size-14" />
      <div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-foreground">
          404
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          This page doesn't exist.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your learning data is safe. Head back and continue where you left
          off.
        </p>
      </div>
      <Button asChild>
        {/* Signed-out users are sent through /auth with this path preserved. */}
        <Link to="/dashboard">
          <ArrowLeft className="mr-2 size-4" />
          Back to Command Center
        </Link>
      </Button>
    </motion.div>
  );
}
