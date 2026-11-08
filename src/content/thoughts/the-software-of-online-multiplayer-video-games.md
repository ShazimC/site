---
title: The Software of Online Multiplayer Video Games
description: Video games are some of the most complex and demanding types of
  software in existence.
date: 2026-11-08
complete: true
featured: false
---

Video games are some of the most complex and demanding types of software in existence.

Let's take league of legends for example. This video game is played by more than 30 million players daily. One match is a shared software session between 10 players, so let's generously say 30 million divided by 10 gives us about 3 million shared sessions per day that Riot Games must orchestrate and sustain as perfectly as possible.

Each session is about 30 minutes, some game modes are shorter, about 15-25 minutes and most are 30 to 40 minutes, so just taking the middle here. 3 million shared sessions daily multiplied by 30 minutes gives us 90 million shared minutes per day where the game session must be orchestrated between 30 to 40 million machines counting the servers needed to network between personal computers.

Those are only the macro level of numbers **outside** the games, now let's get into the numbers **within** the games themselves.

In a single match of league of legends, and I'll be taking a professional match as the main example for dramatic effect, the amount of actions per game and per minute that succeed with minimal latency (dependent on user's network) have, as far as I can see, a very high success rate now in 2026. I want to say it's between 95 to 99%, I don't have solid numbers.

Let's take a look at a single game like HLE vs BLG, the most recent MSI grand finals match, as an example to napkin math calculate the amount of actions per game.

In such a game, one of the main functions is to farm enemy minions. Minions are little, well, defeat-able minions that spawn from the enemy base and progress towards each lane in a single file line. Farming minions means you have to hit the minion when they have just low enough hit points left such that hitting it counts as your kill. You can hit the minion by either clicking on it or using an ability on it. Usually before the player farms the minion, they're moving around back and forth in order to avoid enemy targeting.

That was a lot. Let's take a breath, ditch the rest, and just get to the number of actions we're looking for. Let's say the player clicks around 4 times before they click on the minion to kill it. So in total 5 actions per minion. (There are a lot more factors that go into the actions per minion in a game, especially as the game goes on and abilities start getting used to farm but this is sufficient for napkin math).

5 actions per minion and for a pro player in a 30 minute game, usually each player has around 300 minion kills, so that would total them 5 \* 300 = \~1500 actions for their farm. Let's up it to 2000 to count other movement around enemy players in the lane and ability usage required in order to farm successfully.

Actions around other players and objectives, including approaching, dodging, auto attacking, warding, and ability usage, let's say totals to about 2500 actions per game. Source: I made it up. Jk just imagining via my experience of playing and watching thousands of games.

So in total we have 4500 actions per game per player. For supports it's likely a little less. Let's up it to 5000 for dramatic effect, a nicer number, and likely things that I'm not taking into account.

So final number 5000 actions per player per game. 10 players, 5000 \* 10 = 50,000 actions per game. 50,000 \* 3 million games per day = 150,000,000,000 actions per day.

About 150 billion actions per day. 150 billion per day = 6.25 billion per hour. It variates based on busy times vs quiet times, but for the sake of napkin math: we ball.

So around 6.25 billion actions per hour are being orchestrated by Riot Games over a complex, distributed, and latency-minimizing network.

What's my point?

Well, most HTTP CRUD web apps on the internet start to look pretty small potatoes when you take a look the massive feat multiplayer games like League of Legends have been able to accomplish. While REST dashboards are still struggling to get a few POST request to travel and return just right for let's say thousands of users, 6.25 billion actions per hour traveling back and forth in a performance optimized C++ session over the network via UDP in 50 milliseconds starts to look like a completely different ball game.

I'm primarily a web developer and have never made something like League so I'm quite in awe and praise comes from my heart for things that put me in awe. And I genuinely believe that whatever is praise-worthy is something worth learning from with full attention.

Maybe there's something the rest of the technology industry can learn from the multiplayer video game industry when it comes to excellent craft. I can truly see that video game development and orchestration at this scale, especially ones that are played in e-sports at the stakes millions of not hundreds of millions of dollars, set quite honestly a completely different standard in engineering.

I wonder if there are patterns there, that when learned well, can be transferred to other similar industries to yield similar results.
