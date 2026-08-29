import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to your inbox. Click it to activate your account, then{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            sign in
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or try signing up again in a moment.
        </p>
      </CardContent>
    </Card>
  );
}
