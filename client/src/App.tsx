import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import DocumentDetail from "./pages/DocumentDetail";
import Viewer from "./pages/Viewer";
import Folders from "./pages/Folders";
import FolderDetail from "./pages/FolderDetail";
import JoinFolder from "./pages/JoinFolder";
import DeckComposer from "./pages/DeckComposer";
import FolderDeckDetail from "./pages/FolderDeckDetail";
import { Welcome } from "./pages/Welcome";
import NarrationLibrary from "./pages/NarrationLibrary";
import Admin from "./pages/Admin";

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={Home} />
      <Route path="/view/:slug" component={Viewer} />

      {/* Authenticated dashboard routes */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/upload" component={Upload} />
      <Route path="/doc/:id" component={DocumentDetail} />
      <Route path="/folders" component={Folders} />
      <Route path="/folders/:id" component={FolderDetail} />
      <Route path="/join/:token" component={JoinFolder} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/narrations" component={NarrationLibrary} />
      <Route path="/admin" component={Admin} />
      <Route path="/compose/:folderId/:deckId" component={DeckComposer} />
      <Route path="/folders/:folderId/decks/:deckId" component={FolderDeckDetail} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
