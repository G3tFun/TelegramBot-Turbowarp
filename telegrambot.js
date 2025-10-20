(function (Scratch) {
  'use strict';

  if (!Scratch || !Scratch.extensions) {
    throw new Error('This environment does not support Scratch extensions.');
  }

  class HTTPHandler {
    constructor() {
      this.baseURL = '';
      this.headers = { 'Content-Type': 'application/json' };
    }

    setBaseURL(url) {
      this.baseURL = url;
    }

    setHeader(key, value) {
      this.headers[key] = value;
    }

    async get(endpoint, params = {}) {
      try {
        const url = new URL(endpoint, this.baseURL);
        Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));
        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: this.headers
        });
        return await this._handleResponse(resp);
      } catch (e) {
        return this._handleError(e);
      }
    }

    async post(endpoint, data = {}) {
      try {
        const url = new URL(endpoint, this.baseURL);
        const resp = await fetch(url.toString(), {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(data)
        });
        return await this._handleResponse(resp);
      } catch (e) {
        return this._handleError(e);
      }
    }

    async _handleResponse(response) {
      if (!response.ok) {
        throw new Error(`HTTP ошибка! статус: ${response.status}`);
      }
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) return await response.json();
      return await response.text();
    }

    _handleError(error) {
      console.error('HTTP запрос не удался:', error);
      return { success: false, error: error.message };
    }
  }

  class TelegramBotExtension {
    constructor() {
      this.http = new HTTPHandler();
      this.botToken = '';
      this.welcomeMessage = '';
      this.commands = new Map();
      this.menus = new Map();
      this.buttonHandlers = new Map();
      
      // Для поллинга
      this.polling = false;
      this.offset = 0;
      this.lastMessage = '';
      this.lastChatId = '';
    }

    getInfo() {
      return {
        id: 'telegramBot',
        name: 'Telegram Bot',
        docsURI: 'https://core.telegram.org/bots/api',
        color1: '#0088cc',
        color2: '#0077b3',
        color3: '#006699',
        blocks: [
          {
            opcode: 'setBotToken',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Установить токен бота: [TOKEN]',
            arguments: {
              TOKEN: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'
              }
            }
          },
          {
            opcode: 'startPolling',
            blockType: Scratch.BlockType.COMMAND,
            text: '🟢 Запустить бота'
          },
          {
            opcode: 'stopPolling',
            blockType: Scratch.BlockType.COMMAND,
            text: '🔴 Остановить бота'
          },
          {
            opcode: 'isPolling',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'Бот работает?'
          },
          {
            opcode: 'setWelcomeMessage',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Установить приветственное сообщение: [MESSAGE]',
            arguments: {
              MESSAGE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Добро пожаловать!'
              }
            }
          },
          {
            opcode: 'addCommand',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Добавить команду /[COMMAND] с сообщением: [MESSAGE]',
            arguments: {
              COMMAND: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'help'
              },
              MESSAGE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Это справка'
              }
            }
          },
          {
            opcode: 'createMenu',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Создать меню для команды /[COMMAND]',
            arguments: {
              COMMAND: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'menu'
              }
            }
          },
          {
            opcode: 'addButtonToMenu',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Добавить кнопку [BUTTON_TEXT] с ID: [BUTTON_ID] в меню /[COMMAND]',
            arguments: {
              COMMAND: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'menu'
              },
              BUTTON_TEXT: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Кнопка 1'
              },
              BUTTON_ID: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'button1'
              }
            }
          },
          {
            opcode: 'setButtonHandler',
            blockType: Scratch.BlockType.COMMAND,
            text: 'При нажатии кнопки [BUTTON_ID] отправить: [MESSAGE]',
            arguments: {
              BUTTON_ID: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'button1'
              },
              MESSAGE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Вы нажали кнопку!'
              }
            }
          },
          {
            opcode: 'sendMessage',
            blockType: Scratch.BlockType.COMMAND,
            text: 'Отправить сообщение [MESSAGE] в чат [CHAT_ID]',
            arguments: {
              CHAT_ID: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '123456789'
              },
              MESSAGE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Тестовое сообщение'
              }
            }
          },
          {
            opcode: 'getLastMessage',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Последнее сообщение'
          },
          {
            opcode: 'getLastChatId',
            blockType: Scratch.BlockType.REPORTER,
            text: 'ID последнего чата'
          }
        ]
      };
    }

    setBotToken(args) {
      const token = Scratch.Cast.toString(args.TOKEN).trim();
      this.botToken = token;
      if (this.botToken) {
        this.http.setBaseURL(`https://api.telegram.org/bot${this.botToken}/`);
        console.log('Токен бота установлен');
      } else {
        console.warn('Пустой токен бота');
      }
    }

    setWelcomeMessage(args) {
      this.welcomeMessage = Scratch.Cast.toString(args.MESSAGE);
      console.log('Приветственное сообщение установлено:', this.welcomeMessage);
    }

    addCommand(args) {
      const command = Scratch.Cast.toString(args.COMMAND);
      const message = Scratch.Cast.toString(args.MESSAGE);
      const cmdName = command.startsWith('/') ? command : `/${command}`;
      this.commands.set(cmdName, message);
      console.log(`Команда ${cmdName} добавлена`);
    }

    createMenu(args) {
      const command = Scratch.Cast.toString(args.COMMAND);
      const cmdName = command.startsWith('/') ? command : `/${command}`;
      if (!this.menus.has(cmdName)) {
        this.menus.set(cmdName, []);
        console.log(`Меню для команды ${cmdName} создано`);
      }
    }

    addButtonToMenu(args) {
      const command = Scratch.Cast.toString(args.COMMAND);
      const buttonText = Scratch.Cast.toString(args.BUTTON_TEXT);
      const buttonId = Scratch.Cast.toString(args.BUTTON_ID);
      const cmdName = command.startsWith('/') ? command : `/${command}`;
      
      if (!this.menus.has(cmdName)) {
        this.menus.set(cmdName, []);
      }
      
      const menu = this.menus.get(cmdName);
      menu.push({ text: buttonText, callback_data: buttonId });
      console.log(`Кнопка "${buttonText}" добавлена в меню ${cmdName}`);
    }

    setButtonHandler(args) {
      const buttonId = Scratch.Cast.toString(args.BUTTON_ID);
      const message = Scratch.Cast.toString(args.MESSAGE);
      this.buttonHandlers.set(buttonId, message);
      console.log(`Обработчик для кнопки ${buttonId} установлен`);
    }

    async sendMessage(args) {
      try {
        if (!this.botToken) {
          console.error('Токен бота не установлен');
          return;
        }
        
        const chat_id = Scratch.Cast.toString(args.CHAT_ID);
        const text = Scratch.Cast.toString(args.MESSAGE);
        
        const result = await this.http.post('sendMessage', {
          chat_id: chat_id,
          text: text,
          parse_mode: 'HTML'
        });
        
        console.log('Сообщение отправлено:', result);
        return result;
      } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
      }
    }

    startPolling() {
      if (this.polling) {
        console.log('Бот уже запущен');
        return;
      }
      
      if (!this.botToken) {
        console.error('Установите токен бота перед запуском');
        return;
      }
      
      this.polling = true;
      console.log('Бот запущен');
      this._pollUpdates();
    }

    stopPolling() {
      this.polling = false;
      console.log('Бот остановлен');
    }

    isPolling() {
      return this.polling;
    }

    getLastMessage() {
      return this.lastMessage || '';
    }

    getLastChatId() {
      return this.lastChatId || '';
    }

    async _pollUpdates() {
      while (this.polling) {
        try {
          const response = await this.http.get('getUpdates', {
            offset: this.offset,
            timeout: 30
          });
          
          if (response && response.result && Array.isArray(response.result)) {
            for (const update of response.result) {
              await this._processUpdate(update);
              this.offset = update.update_id + 1;
            }
          }
        } catch (error) {
          console.error('Ошибка получения обновлений:', error);
        }
        
        // Небольшая пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    async _processUpdate(update) {
      try {
        // Обработка обычных сообщений
        if (update.message) {
          const message = update.message;
          const text = message.text || '';
          const chatId = message.chat.id;
          
          this.lastMessage = text;
          this.lastChatId = String(chatId);
          
          console.log(`Получено сообщение: "${text}" от чата ${chatId}`);
          
          // Обработка команды /start
          if (text === '/start' && this.welcomeMessage) {
            await this.http.post('sendMessage', {
              chat_id: chatId,
              text: this.welcomeMessage
            });
            console.log('Отправлено приветственное сообщение');
          }
          
          // Обработка других команд
          if (this.commands.has(text)) {
            await this.http.post('sendMessage', {
              chat_id: chatId,
              text: this.commands.get(text)
            });
            console.log(`Обработана команда: ${text}`);
          }
          
          // Обработка меню
          if (this.menus.has(text)) {
            const menu = this.menus.get(text);
            if (menu.length > 0) {
              const keyboard = [];
              for (let i = 0; i < menu.length; i += 2) {
                const row = [menu[i]];
                if (menu[i + 1]) row.push(menu[i + 1]);
                keyboard.push(row);
              }
              
              await this.http.post('sendMessage', {
                chat_id: chatId,
                text: 'Выберите действие:',
                reply_markup: {
                  inline_keyboard: keyboard
                }
              });
              console.log(`Отправлено меню для команды: ${text}`);
            }
          }
        }
        
        // Обработка нажатий на кнопки
        if (update.callback_query) {
          const query = update.callback_query;
          const buttonId = query.data;
          const chatId = query.message.chat.id;
          
          console.log(`Нажата кнопка: ${buttonId}`);
          
          if (this.buttonHandlers.has(buttonId)) {
            await this.http.post('sendMessage', {
              chat_id: chatId,
              text: this.buttonHandlers.get(buttonId)
            });
          }
          
          // Подтверждаем получение callback
          await this.http.post('answerCallbackQuery', {
            callback_query_id: query.id
          });
        }
      } catch (error) {
        console.error('Ошибка обработки обновления:', error);
      }
    }
  }

  Scratch.extensions.register(new TelegramBotExtension());
})(Scratch);
