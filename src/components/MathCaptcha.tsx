"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Calculator } from "lucide-react";

interface MathCaptchaProps {
  onVerify: (isValid: boolean, token?: string) => void;
  onReset?: () => void;
}

interface MathQuestion {
  question: string;
  answer: number;
  id: string;
}

const MathCaptcha: React.FC<MathCaptchaProps> = ({ onVerify, onReset }) => {
  const [mathQuestion, setMathQuestion] = useState<MathQuestion | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  // Generate random math question
  const generateMathQuestion = (): MathQuestion => {
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let num1: number, num2: number, answer: number, question: string;

    switch (operation) {
      case '+':
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        answer = num1 + num2;
        question = `${num1} + ${num2}`;
        break;
      case '-':
        num1 = Math.floor(Math.random() * 50) + 25; // Ensure positive result
        num2 = Math.floor(Math.random() * 25) + 1;
        answer = num1 - num2;
        question = `${num1} - ${num2}`;
        break;
      case '*':
        num1 = Math.floor(Math.random() * 12) + 1;
        num2 = Math.floor(Math.random() * 12) + 1;
        answer = num1 * num2;
        question = `${num1} × ${num2}`;
        break;
      default:
        num1 = 2;
        num2 = 3;
        answer = 5;
        question = "2 + 3";
    }

    return {
      question,
      answer,
      id: `math_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  };

  // Initialize math question
  useEffect(() => {
    setMathQuestion(generateMathQuestion());
  }, []);

  // Reset function
  const handleReset = () => {
    setMathQuestion(generateMathQuestion());
    setUserAnswer("");
    setError("");
    setIsVerifying(false);
    if (onReset) onReset();
  };

  // Verify answer
  const handleVerify = async () => {
    if (!mathQuestion) return;

    setIsVerifying(true);
    setError("");

    // Simulate verification delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const userNum = parseInt(userAnswer.trim());
    
    if (isNaN(userNum)) {
      setError("Please enter a valid number");
      setIsVerifying(false);
      return;
    }

    if (userNum === mathQuestion.answer) {
      // Generate a simple token for verification
      const token = btoa(`math_captcha_${mathQuestion.id}_${Date.now()}`);
      onVerify(true, token);
    } else {
      setError("Incorrect answer. Please try again.");
      handleReset();
      onVerify(false);
    }

    setIsVerifying(false);
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isVerifying) {
      handleVerify();
    }
  };

  if (!mathQuestion) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2 text-center">
            <Calculator className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Math Verification</h3>
          </div>

          {/* Math Question */}
          <div className="text-center">
            <Label htmlFor="math-answer" className="text-sm text-gray-600">
              What is:
            </Label>
            <div className="text-2xl font-bold text-gray-800 my-2 p-3 bg-gray-50 rounded-lg border">
              {mathQuestion.question} = ?
            </div>
          </div>

          {/* Answer Input */}
          <div className="space-y-2">
            <Label htmlFor="math-answer">Your Answer:</Label>
            <Input
              id="math-answer"
              type="number"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your answer"
              disabled={isVerifying}
              className="text-center text-lg"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleVerify}
              disabled={isVerifying || !userAnswer.trim()}
              className="flex-1"
            >
              {isVerifying ? "Verifying..." : "Verify"}
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={isVerifying}
              size="icon"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-gray-500 text-center">
            Solve the math problem to verify you&apos;re human
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MathCaptcha;
