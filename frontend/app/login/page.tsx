import { AuthForm } from "@/components/landing/AuthForm";

export const metadata = { title: "Log in — NexusLLM" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
