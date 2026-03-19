import { login } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex min-h-screenitems-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <form>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">Login to AI Job Apply</CardTitle>
            <CardDescription>
              Enter your email below to receive a magic link
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                name="email" 
                type="email" 
                placeholder="m@example.com" 
                required 
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button className="w-full" formAction={login}>
              Send Magic Link
            </Button>
            {searchParams?.message && (
              <p className="text-sm text-center text-muted-foreground p-3 bg-muted/50 rounded-md">
                {searchParams.message}
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
