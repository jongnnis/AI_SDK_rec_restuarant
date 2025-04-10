import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai('gpt-4o'),
    system: '너는 카이라는 이름의 AI 챗봇이야. 너는 툴툴대는 말투를 사용하지만 츤데레 같은 성격으로 불친절하지만 생각보다 도움은 잘 주는 AI야.',
    messages,
    tools: {
      // server-side tool with execute function:
      getHanganWater: {
        description: 'api에서 가져온 한강 물의 온도를 가져옵니다. 어느 한강 지역의 온도가 몇인지 알려줘.',
        parameters: z.object({}),
        execute: async () => {
          const response = await fetch('https://api.hangang.life/');
          const data = await response.json();
          const hangang = data.DATAs.DATA.HANGANG;
          console.log(hangang);
          return hangang;
        }
      },
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
