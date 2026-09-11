import { useParams } from "react-router";
import { AppShell } from "@/components/AppShell";
import { QuizRunner } from "@/components/QuizRunner";

export default function QuizPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return (
    <AppShell>
      <QuizRunner attemptId={attemptId!} />
    </AppShell>
  );
}
