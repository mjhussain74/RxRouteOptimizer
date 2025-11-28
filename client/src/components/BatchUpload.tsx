import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface BatchUploadProps {
  onBatchCreated: (batchId: number) => void;
}

export default function BatchUpload({ onBatchCreated }: BatchUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/batches/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Failed to upload batch");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      onBatchCreated(data.batch.id);
      setFile(null);
      setBatchName("");
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "text/csv" || droppedFile.name.endsWith(".csv")) {
        setFile(droppedFile);
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", batchName || `Batch ${new Date().toLocaleDateString()}`);
    uploadMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Upload Delivery Addresses</h2>
        <p className="text-slate-400">
          Upload a CSV file containing your delivery addresses. The system will automatically geocode and prepare them for route optimization.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-400" />
              Upload CSV File
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="batch-name" className="text-slate-300">Batch Name (optional)</Label>
              <Input
                id="batch-name"
                placeholder="e.g., Morning Deliveries"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? "border-blue-400 bg-blue-500/10"
                  : file
                  ? "border-green-400 bg-green-500/10"
                  : "border-slate-600 hover:border-slate-500"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              {file ? (
                <div className="space-y-2">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-400" />
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-slate-400 text-sm">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-slate-500" />
                  <p className="text-slate-300">
                    Drag and drop your CSV file here
                  </p>
                  <p className="text-slate-500 text-sm">
                    or click to browse
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || uploadMutation.isPending}
              className="w-full bg-blue-500 hover:bg-blue-600"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Process
                </>
              )}
            </Button>

            {uploadMutation.isError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                Failed to upload file. Please try again.
              </div>
            )}

            {uploadMutation.isSuccess && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="h-4 w-4" />
                Successfully processed {uploadMutation.data.totalCount} addresses
                ({uploadMutation.data.geocodedCount} geocoded)
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-400" />
              CSV Format Guide
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="text-slate-300 text-sm">
                Your CSV file should include the following columns:
              </p>
              
              <div className="bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-blue-400 font-mono text-sm bg-blue-500/10 px-2 py-0.5 rounded">address</span>
                  <span className="text-slate-400 text-sm">Full delivery address (required)</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-slate-400 font-mono text-sm bg-slate-700/50 px-2 py-0.5 rounded">customer_name</span>
                  <span className="text-slate-400 text-sm">Customer name (optional)</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-slate-400 font-mono text-sm bg-slate-700/50 px-2 py-0.5 rounded">customer_phone</span>
                  <span className="text-slate-400 text-sm">Contact phone (optional)</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-slate-400 font-mono text-sm bg-slate-700/50 px-2 py-0.5 rounded">notes</span>
                  <span className="text-slate-400 text-sm">Delivery notes (optional)</span>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-500 text-xs mb-2">Example CSV:</p>
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
{`address,customer_name,customer_phone,notes
123 Main St, New York, NY,John Doe,555-0101,Leave at door
456 Oak Ave, Brooklyn, NY,Jane Smith,555-0102,Ring bell twice`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
