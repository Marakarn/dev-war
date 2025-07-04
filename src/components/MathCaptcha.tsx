"use client";

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface MathCaptchaProps {
  onVerify: (success: boolean) => void;
  onError?: (error: string) => void;
}

const MathCaptcha: React.FC<MathCaptchaProps> = ({ onVerify, onError }) => {
  const [firstNumber, setFirstNumber] = useState(0);
  const [secondNumber, setSecondNumber] = useState(0);
  const [operation, setOperation] = useState<'+' | '-' | '*'>('*');
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Generate a new math problem
    generateMathProblem();
  }, []);

  const generateMathProblem = () => {
    const operations: Array<'+' | '-' | '*'> = ['+', '-', '*'];
    const selectedOperation = operations[Math.floor(Math.random() * operations.length)];
    
    let num1, num2;
    
    // Generate appropriate numbers based on operation
    if (selectedOperation === '+') {
      num1 = Math.floor(Math.random() * 50) + 1;
      num2 = Math.floor(Math.random() * 50) + 1;
    } else if (selectedOperation === '-') {
      num1 = Math.floor(Math.random() * 50) + 25; // Ensure positive result
      num2 = Math.floor(Math.random() * num1) + 1;
    } else { // multiplication
      num1 = Math.floor(Math.random() * 12) + 1; // Keep multiplication manageable
      num2 = Math.floor(Math.random() * 12) + 1;
    }
    
    setFirstNumber(num1);
    setSecondNumber(num2);
    setOperation(selectedOperation);
    setUserAnswer('');
  };

  const calculateCorrectAnswer = (): number => {
    switch (operation) {
      case '+':
        return firstNumber + secondNumber;
      case '-':
        return firstNumber - secondNumber;
      case '*':
        return firstNumber * secondNumber;
      default:
        return 0;
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setErrorMessage('');
    
    try {
      const correctAnswer = calculateCorrectAnswer();
      const isCorrect = parseInt(userAnswer) === correctAnswer;
      
      if (isCorrect) {
        // If user answered correctly, create a token to pass to the verify-captcha endpoint
        const simpleToken = Math.random().toString(36).substring(2, 15);
        
        // Call the verify API to maintain the same flow
        const response = await fetch("/api/verify-captcha", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: simpleToken }),
        });

        const data = await response.json();
        onVerify(data.success);
      } else {
        setErrorMessage('Incorrect answer. Please try again.');
        generateMathProblem(); // Generate a new problem
        if (onError) onError('Incorrect answer. Please try again.');
        onVerify(false);
      }
    } catch (error) {
      console.error('Verification error:', error);
      setErrorMessage('Failed to verify. Please try again.');
      if (onError) onError('Failed to verify. Please try again.');
      onVerify(false);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Human Verification</h3>
        <p className="text-sm text-gray-500">Please solve this math problem</p>
      </div>
      
      <div className="flex flex-col space-y-4">
        <div className="text-center">
          <span className="text-xl font-bold">
            {firstNumber} {operation} {secondNumber} = ?
          </span>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="answer">Your Answer</Label>
          <Input
            id="answer"
            type="number"
            placeholder="Enter your answer"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            className="w-full"
          />
        </div>
        
        {errorMessage && (
          <div className="text-sm text-red-500">{errorMessage}</div>
        )}
        
        <Button 
          onClick={handleVerify}
          disabled={isVerifying || userAnswer === ''}
          className="w-full"
        >
          {isVerifying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify"
          )}
        </Button>
        
        <Button 
          variant="outline"
          onClick={generateMathProblem}
          disabled={isVerifying}
          className="w-full"
        >
          Try a Different Problem
        </Button>
      </div>
    </div>
  );
};

export default MathCaptcha;
