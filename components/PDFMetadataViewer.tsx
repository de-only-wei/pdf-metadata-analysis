"use client";

import React, { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import PasswordDialog from "./PasswordDialog";

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

interface PDFInfoDictionary {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: string;
  ModDate?: string;
  LastModified?: string;
  Format?: string;
  PDFFormatVersion?: string;
  PageCount?: string;
  Encrypted?: string;
  Rights?: string;
  Tagged?: string;
  [key: string]: string | undefined;
}

interface PDFMetadata {
  fileName: string;
  fileSize: string;
  fileType: string;
  isPDF: boolean;
  pdfVersion: string | null | undefined;
  infoDict: PDFInfoDictionary;
}

export default function PDFMetadataViewer(): JSX.Element {
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();
  const [attempts, setAttempts] = useState(0);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatPDFDate = (dateStr: string): string => {
    const match = dateStr.match(
      /D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([-+]\d{2}'\d{2}')?/
    );
    if (match) {
      const [_, year, month, day, hour, minute, second, timezone] = match;
      const date = new Date(
        `${year}-${month}-${day}T${hour}:${minute}:${second}${
          timezone ? timezone.replace(/'/g, ":").slice(0, -1) : "Z"
        }`
      );
      return date.toLocaleString();
    }
    return dateStr;
  };

  const extractMetadata = async (
    file: File,
    password?: string
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const textContent = new TextDecoder().decode(uint8Array);

      // Check if the PDF is encrypted
      const encryptedMatch = textContent.includes("/Encrypt");

      if (encryptedMatch && !password) {
        setCurrentFile(file);
        setShowPasswordDialog(true);
        setIsLoading(false);
        return;
      }

      // Initialize basic metadata
      const basicMetadata = {
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        fileType: file.type,
      };

      const header = new TextDecoder().decode(uint8Array.slice(0, 8));
      const isPDF = header.includes("%PDF");
      const pdfVersion = isPDF ? header.match(/%PDF-(\d+\.\d+)/)?.[1] : null;

      let infoDict: PDFInfoDictionary = {
        "Last Modified": `${new Date(
          file.lastModified
        ).toLocaleString()} (last time the file was saved or moved on your computer)`,
      };

      try {
        // Load the PDF with the password if provided
        const loadingTask = pdfjsLib.getDocument({
          data: uint8Array,
          password: password,
        });

        const pdfDoc = await loadingTask.promise;

        // If we reach here, password was correct (if required)
        const metadata = await pdfDoc.getMetadata();

        // Update infoDict with decrypted metadata
        if (metadata?.info) {
          Object.entries(metadata.info).forEach(([key, value]) => {
            if (typeof value === "string") {
              if (key === "CreationDate") {
                infoDict[key] = `${formatPDFDate(
                  value
                )} (when the PDF was first created)`;
              } else if (key === "ModDate") {
                infoDict[key] = `${formatPDFDate(
                  value
                )} (when the PDF content was last modified)`;
              } else {
                infoDict[key] = value;
              }
            }
          });
        }

        // Get page count
        infoDict["Page Count"] = `${pdfDoc.numPages} pages`;

        // Security status
        infoDict["Security Status"] = encryptedMatch
          ? "Encrypted (this PDF has security restrictions)"
          : "Not Encrypted (this PDF has no security restrictions)";

        // Accessibility check
        const taggedMatch = textContent.includes("/MarkInfo");
        infoDict["Accessibility"] = taggedMatch
          ? "Tagged PDF (accessible for screen readers)"
          : "Not Tagged (limited accessibility support)";

        const fullMetadata: PDFMetadata = {
          ...basicMetadata,
          isPDF,
          pdfVersion,
          infoDict,
        };

        setMetadata(fullMetadata);
        setShowPasswordDialog(false);
        setCurrentFile(null);
        setPasswordError(undefined);
        setAttempts(0);
      } catch (error) {
        const err = error as { name?: string; message?: string };
        if (err.name === "PasswordException") {
          if (password) {
            setAttempts((prev) => prev + 1);
            throw new Error("Invalid password. Please try again.");
          } else {
            setCurrentFile(file);
            setShowPasswordDialog(true);
            return;
          }
        } else {
          throw new Error(
            `Error processing PDF: ${err.message || "Unknown error"}`
          );
        }
      }
    } catch (err) {
      if (password) {
        setPasswordError(
          err instanceof Error ? err.message : "Failed to decrypt PDF"
        );
      } else {
        setError(
          `Error processing file: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (currentFile) {
      await extractMetadata(currentFile, password);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      await extractMetadata(file);
    }
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await extractMetadata(file);
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const MetadataGrid: React.FC<{
    title: string;
    data: Record<string, string | undefined>;
  }> = ({ title, data }) => (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-2 bg-gray-50 p-4 rounded-lg">
        {Object.entries(data).map(
          ([key, value]) =>
            value && (
              <React.Fragment key={key}>
                <div className="font-medium">{key}:</div>
                <div className="text-sm">{value}</div>
              </React.Fragment>
            )
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-semibold">PDF Metadata Viewer</h2>
      </div>

      <div className="p-6">
        <label>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition duration-200"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-gray-600">Drag and drop your PDF file here</p>
            <p className="text-sm text-gray-500 mt-2">
              or click to select a file
            </p>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </label>

        {isLoading && (
          <div className="mt-4 text-center text-gray-600">
            Extracting metadata...
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-lg">
            <h4 className="font-semibold">Error</h4>
            <p>{error}</p>
          </div>
        )}

        {metadata && (
          <div className="mt-6 space-y-6">
            <MetadataGrid
              title="Basic Information"
              data={{
                "File Name": metadata.fileName,
                "File Size": metadata.fileSize,
                "File Type": metadata.fileType,
                "PDF Version": metadata.isPDF
                  ? `${
                      metadata.pdfVersion || "Unknown"
                    } (PDF specification version)`
                  : "Not a PDF",
              }}
            />

            {Object.keys(metadata.infoDict).length > 0 && (
              <MetadataGrid
                title="PDF Information Dictionary"
                data={metadata.infoDict}
              />
            )}
          </div>
        )}
      </div>

      <PasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => {
          setShowPasswordDialog(false);
          setCurrentFile(null);
          setPasswordError(undefined);
          setAttempts(0);
        }}
        onSubmit={handlePasswordSubmit}
        error={passwordError}
      />
    </div>
  );
}
