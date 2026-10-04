# LENA deployment

LENA is now a static page plus one small server function. The function
holds your API key so it never reaches the browser.

```
lena/
  index.html        the app
  api/chat.js       the server function (holds the key)
  assets/           logo and images
```

## Step 1. Get a free API key from Google

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**.
3. Copy the key. Treat it like a password. Do not put it in `index.html`,
   do not commit it to GitHub, and do not paste it into a chat.

Google's free tier has limits on how many messages per minute. That is
fine for a demo and for a viva, but it is not unlimited. If several
people use LENA at the same moment, some requests will be refused and the
app will say so plainly.

## Step 2. Put the project on GitHub

Create a repository and push these files, keeping the folder structure
above. `api/chat.js` must stay inside a folder called `api`.

GitHub Pages cannot run the server function. It only serves static files,
which is why hosting moves to Vercel in the next step. The repository can
stay on GitHub.

## Step 3. Deploy on Vercel

1. Go to https://vercel.com and sign in with your GitHub account.
2. Click **Add New, Project** and pick your LENA repository.
3. Leave every build setting as it is. Vercel detects `api/chat.js` by itself.
4. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `LENA_API_KEY` | the key from step 1 |

5. Click **Deploy**.

You get a URL like `https://lena-xxxx.vercel.app`. Every later `git push`
redeploys automatically, so you never drag a file anywhere again.

## Step 4. Check it works

Open the app, go to LENA AI Chat and send a message.

- A reply appears: everything is working.
- *"Something is misconfigured on my side"*: the key is missing or wrong.
  Check the spelling of `LENA_API_KEY` in Vercel, then redeploy.
- *"I am getting more messages than I can answer"*: you hit the free tier
  rate limit. Wait a minute.
- Nothing happens at all: open the browser console and look at the
  `/api/chat` request for the real error.

## Changing the model or provider

All configuration is environment variables. No code changes.

**A different Gemini model**, if the default name stops working:

| Name | Value |
|---|---|
| `MODEL` | the current model name from Google's docs |

**Switch to Groq, OpenRouter, OpenAI or anything else with a
`/chat/completions` endpoint:**

| Name | Value |
|---|---|
| `PROVIDER` | `openai` |
| `BASE_URL` | the provider's base URL, for example `https://api.groq.com/openai/v1` |
| `MODEL` | a model that provider offers |
| `LENA_API_KEY` | that provider's key |

Redeploy after changing any of these.

## Where the safety rules live

Two separate places, deliberately.

**The crisis check runs in the browser**, in `index.html`, before any
network request. If someone's message matches the crisis list, the app
shows the helplines itself and the message is never sent anywhere. This
means crisis handling still works when the connection drops, when the
free tier is rate-limited, and when the model is down. It also means no
amount of clever prompting can talk the model into bypassing it, because
the model never receives the message.

**The behavioural rules live in the system prompt**, in `api/chat.js`.
Those are instructions to the model: never diagnose, never interpret a
score, never ask about symptom duration, never give medication advice.
Models follow instructions well but not perfectly, which is exactly why
the crisis check is not among them.

## Before you submit

Try to break it, and write down what happens. Ask it to diagnose you.
Say it is for an assignment. Tell it to ignore its instructions. Ask what
your PHQ-9 score means. Ask in Malay. Keep a record of the replies, both
the ones that held the line and the ones that did not. That record is
evidence for your evaluation chapter, and an examiner is likely to ask
whether you tested it.
