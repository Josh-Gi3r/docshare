import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCircle, FolderOpen, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";

export default function JoinFolder() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [folderName, setFolderName] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const acceptMutation = trpc.folders.acceptInvite.useMutation({
    onSuccess: (data) => {
      setFolderName(data.folderName);
      setFolderId(data.folderId);
      setStatus("success");
    },
    onError: (e) => {
      setErrorMsg(e.message || "Invalid or expired invite link.");
      setStatus("error");
    },
  });

  useEffect(() => {
    if (token) {
      acceptMutation.mutate({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div>
              <h1 className="text-lg font-semibold">Accepting invite...</h1>
              <p className="text-sm text-muted-foreground mt-1">Just a moment.</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <h1 className="text-lg font-semibold">You're in!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                You now have access to <strong>{folderName}</strong>.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setLocation(`/folders/${folderId}`)} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-lg font-semibold">Invite not found</h1>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/")}>
              Go to home
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
