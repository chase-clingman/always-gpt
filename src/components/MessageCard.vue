<template>
  <q-card-section class="message" :class="message.role">
    <div class="message-content" v-html="message.content" />
  </q-card-section>
</template>

<script>
export default {
  props: ['message']
}
</script>

<style scoped>
.message {
  padding: 10px;
  padding-top: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid black;
}

.message-content {
  max-width: 600px;
  margin: 0 auto;
}

.message.user {
  background-color: #343541; /* light green */
  color: white; /* dark green */
}

.message.assistant {
  background-color: #444654; /* light red */
  color: white; /* dark red */
}

</style>
