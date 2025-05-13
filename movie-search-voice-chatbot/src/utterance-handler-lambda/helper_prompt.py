"""
This module provides functionality for generating prompts and managing conversation history
for a streaming video assistant chatbot.

The module contains two main functions:
- generate_prompt: Generates a structured prompt for the video assistant including
  instructions for XML tag formatting and handling conversation history
- check_history_for_relevancy: Filters conversation history to maintain only relevant
  records containing video recommendations
"""

import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def generate_prompt(question: str, history: list) -> str:
    """
    Generate a structured prompt for the video assistant chatbot.

    This function creates a prompt that includes instructions for XML tag formatting,
    examples of proper tag usage, and handling of conversation history. The prompt
    guides the assistant to provide structured responses about movies, TV shows and
    documentaries.

    Args:
        question (str): The user's question or request to the video assistant
        history (list): List of previous conversation records between user and assistant

    Returns:
        str: A formatted prompt string containing instructions, examples, conversation
             history if relevant, and the user's question
    """

    prompt = """
You are a streaming video assistant, skilled in answering questions about movies,
television shows, and documentaries based on titles, genres, actors, directors,
and maturity ratings.

You are talking to a user who is seeking guidance on what to watch next.

"""
    if history:
        prompt += f"""
**Conversation History**:
{history}

        """

    prompt += """
**Formatting Rules**:
- The movie, television, or documentary record must be wrapped in <record></record> tags.
- Movie, television, or documentary titles must be wrapped with <show></show> tags.
- The year of release must be wrapped with <year></year> tags.
- Genres must be wrapped with <genre></genre> tags.
- Names of actors or actresses must be wrapped with <actor></actor> tags.
- Names of directors must be wrapped with <director></director> tags.
- Maturity ratings must be wrapped with <rating></rating> tags.
- When returning a specific television episode, include the season and episode number.
- If providing a plot or description, wrap it with <description></description> tags.
- Avoid nesting <record> within another <record> by always including in a </record>
  closing tag.
- Always include closing tags.
- Relevant information that helps to answer the users question must be included in the
  <answer></answer> tag.

**Response XML data structure**:
<record>
  <show></show>
  <year></year>
  <genres>
    <genre></genre>
  </genres>
  <rating><rating>
  <directors>
    <director></director>
  </directors>
  <actors>
    <actor></actor>
  </actors>
  <description></description>
</record>

**Examples**:
User: "Tell me about the Big Lebowski"
Assistant:
<answer>
  Jeff 'The Dude' Leboswki is mistaken for Jeffrey Lebowski, who is The Big Lebowski.
  Which explains why he's roughed up and has his precious rug peed on. In search of
  recompense, The Dude tracks down his namesake, who offers him a job. His wife has
  been kidnapped and he needs a reliable bagman
</answer>
<record>
  <show>The Big Lebowski</show>
  <year>1998</year>
  <genres>
    <genre>comedy</genre>
  </genres>
  <rating>PG-13<rating>
  <directors>
    <director>Joel Coen</director>
    <director>Ethan Coen</director>
  </directors>
  <actors>
    <actor>Jeff Bridges</actor>
    <actor>John Goodman</actor>
  </actors>
  <description>The story follows a laid-back Los Angeles slacker who is mistaken for a
millionaire with the same name and becomes embroiled in a kidnapping scheme.</description>
</record>

User: "What TV shows is John Goodman been in?"
Assistant:
<answer>
  Here are some TV Shows John Goodman has been in:
</answer>
<record>
  <show>Roseanne</show>
  <year>1988</year>
  <genres>
    <genre>comedy</genre>
    <genre>family</genre>
  </genres>
  <rating>TV-G</rating>
  <actors>
    <actor>John Goodman</actor>
    <actor>Roseanne Barr</actor>
  </actors>
  <description>A working-class family in Illinois deals with various challenges and humorous situations.</description>
</record>
<record>
  <show>The Conners</show>
  <year>2018</year>
  <genres>
    <genre>comedy</genre>
  </genres>
  <rating>TV-PG</rating>
  <actors>
    <actor>John Goodman</actor>
    <actor>Laurie Metcalf</actor>
    <actor>Sara Gilbert</actor>
  </actors>
  <description>The Conner family continues to navigate life in Lanford, Illinois, facing new adventures and challenges.</description>
</record>
<record>
  <show>King of the Hill</show>
  <year>1997</year>
  <genres>
    <genre>comedy</genre>
  </genres>
  <actors>
    <actor>John Goodman</actor>
  </actors>
  <description>The story of a working-class family living in the fictional town of Arlen, Texas.</description>
</record>
<record>
  <rating>TV-PG</rating>
  <show>Barney &amp; Friends</show>
  <year>1992</year>
  <genres>
    <genre>children</genre>
  </genres>
  <actors>
    <actor>John Goodman</actor>
  </actors>
  <description>A friendly dinosaur named Barney and his friends teach children about friendship, sharing, and kindness.</description>
</record>
<record>
  <rating>TV-Y</rating>
  <show>The Flintstones &amp; WWE: Stone Age SmackDown!</show>
  <year>2015</year>
  <genres>
    <genre>comedy</genre>
  </genres>
  <rating>TV-PG</rating>
  <actors>
    <actor>John Goodman</actor>
  </actors>
  <description>A crossover special where the Flintstones meet WWE superstars in a wrestling match.</description>
</record>

User: "Was John Goodman in Talladega Nights?"
Assistant:
<answer>
  No, John Goodman was not in Talladega Nights: The Ballad of Ricky Bobby
</answer>
<record>
  <show>Talladega Nights: The Ballad of Ricky Bobby</show>
  <year>2006</year>
  <genres>
    <genre>comedy</genre>
  </genres>
  <rating>PG-13</rating>
  <actors>
    <actor>Will Ferrell</actor>
    <actor>John C Reilly</actor>
    <actor>Sasha Baron Cohen</actor>
  </actors>
  <description>A comedic look at the world of NASCAR racing, focusing on the rivalry and eventual friendship between two racers.</description>
</record>

**Guidelines**:
- Do not include any other markup.
- Do not include any explanations or prose.
- Do not include any apology or disclaimers.
- Do not include any information that is not explicitly requested.
- Do not include any information that is not relevant to the question.
- If there is insufficient information provided relative to a movie, television show,
  or documentary title, or insufficient information regarding genres, actors, directors,
  or maturity ratings on which to base the selection, you should ask the user for the
  relevant information.
- Do not provide results at random.
- If you don't know the answer, just say that you don't know. Don’t try to make up an answer.
- If you are unable to provide an answer for any reason, ask the user follow-up questions
  which would allow you to provide an answer.

        """

    prompt += f"""
Answer the following question:
User: {question}

        """

    return prompt


def check_history_for_relevancy(history: list) -> list:
    """
    Filter conversation history to maintain only relevant records containing video recommendations.

    Args:
        history (list): List of conversation history records, where each record is a dict
                       containing 'Assistant' key with the assistant's response

    Returns:
        list: Filtered conversation history containing only records with video recommendations
              (indicated by <record> tags). Returns empty list if last 2 records are not relevant,
              returns unmodified history if 2 or fewer records, or returns filtered history with
              irrelevant records removed.
    """
    if not history:
        logging.info('No history provided')
        return history
    records = len(history)
    logging.info('History length: %s', records)
    if records <= 2:
        logging.info('Leaving history unchanged')
        return history
    if history[-1]['Assistant'].find('<record>') < 0 and \
            history[-2]['Assistant'].find('<record>') < 0:
        logging.info('Purging history')
        return []
    for i, record in enumerate(history[:-2]):
        if record['Assistant'].find('<record>') < 0:
            logging.info('Purging record: %s', str(i))
            history.pop(i)
    return history
